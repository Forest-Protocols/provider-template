import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  not,
  or,
  sql,
} from "drizzle-orm";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "@/config";
import { DeploymentStatus, generateCID } from "@forest-protocols/sdk";
import { Address } from "viem/accounts";
import { Resource } from "@/types";
import { logger } from "@/logger";
import { cleanupHandlers } from "@/signal";
import * as schema from "./schema";
import pg from "pg";

export type DatabaseClientType = NodePgDatabase<typeof schema>;

/**
 * Database of this provider daemon
 */
class Database {
  client: DatabaseClientType;
  logger = logger.child({ context: "Database" });

  constructor() {
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
    });

    cleanupHandlers.push(async () => {
      this.logger.info("Closing the database connection");
      await pool.end();
      this.logger.info("Database connection closed");
    });

    this.client = drizzle(pool, {
      schema,
    });
  }

  /**
   * Creates a new resource record.
   */
  async createResource(values: schema.DbResourceInsert) {
    await this.client.insert(schema.resourcesTable).values(values);
  }

  /**
   * Updates an existing resource record with the given values.
   */
  async updateResource(
    id: number,
    ptAddress: Address,
    values: {
      name?: string;
      details?: any;
      deploymentStatus?: any;
      groupName?: string;
      isActive?: boolean;
    }
  ) {
    const pt = await this.getProtocol(ptAddress);

    if (!pt) {
      this.logger.error(
        `Protocol not found ${ptAddress} while looking for the resource #${id}`
      );
      return;
    }

    await this.client
      .update(schema.resourcesTable)
      .set(values)
      .where(
        and(
          eq(schema.resourcesTable.id, id),
          eq(schema.resourcesTable.ptAddressId, pt.id)
        )
      );
  }

  /**
   * Marks a resource record as deleted (not active) and deletes its details.
   */
  async deleteResource(id: number, ptAddress: Address) {
    await this.updateResource(id, ptAddress, {
      isActive: false,
      deploymentStatus: DeploymentStatus.Closed,
      details: {}, // TODO: Should we delete all the details (including credentials)?
    });
  }

  async getAllResourcesOfUser(ownerAddress: Address) {
    return await this.resourceQuery().where(
      eq(
        sql`LOWER(${schema.resourcesTable.ownerAddress})`,
        ownerAddress.toLowerCase()
      )
    );
  }

  async getResources(ids: number[]) {
    return await this.client
      .select({
        ...getTableColumns(schema.resourcesTable),
        providerAddress: schema.providersTable.ownerAddress,
      })
      .from(schema.resourcesTable)
      .innerJoin(
        schema.providersTable,
        eq(schema.resourcesTable.providerId, schema.providersTable.id)
      )
      .where(inArray(schema.resourcesTable.id, ids));
  }

  /**
   * Retrieves details of a resource.
   * @param id
   */
  async getResource(
    id: number,
    ownerAddress: string,
    ptAddress: Address
  ): Promise<Resource | undefined> {
    const pt = await this.getProtocol(ptAddress);

    if (!pt) {
      return;
    }

    const [resource] = await this.resourceQuery(pt.address).where(
      and(
        eq(schema.resourcesTable.id, id),
        eq(
          sql`LOWER(${schema.resourcesTable.ownerAddress})`,
          ownerAddress.toLowerCase()
        ),
        eq(schema.resourcesTable.ptAddressId, pt.id)
      )
    );

    if (!resource) return;

    return resource;
  }

  /**
   * Builds a Resource select query
   */
  private resourceQuery(ptAddress?: string) {
    if (!ptAddress) {
      return this.client
        .select({
          id: schema.resourcesTable.id,
          name: schema.resourcesTable.name,
          deploymentStatus: schema.resourcesTable.deploymentStatus,
          details: schema.resourcesTable.details,
          groupName: schema.resourcesTable.groupName,
          isActive: schema.resourcesTable.isActive,
          ownerAddress: sql<Address>`${schema.resourcesTable.ownerAddress}`,
          offerId: schema.resourcesTable.offerId,
          providerId: schema.resourcesTable.providerId,
          providerAddress: sql<Address>`${schema.providersTable.ownerAddress}`,
          ptAddress: sql<Address>`${schema.protocolsTable.address}`,
        })
        .from(schema.resourcesTable)
        .innerJoin(
          schema.protocolsTable,
          eq(schema.protocolsTable.id, schema.resourcesTable.ptAddressId)
        )
        .innerJoin(
          schema.providersTable,
          eq(schema.providersTable.id, schema.resourcesTable.providerId)
        )
        .$dynamic();
    }

    return this.client
      .select({
        id: schema.resourcesTable.id,
        name: schema.resourcesTable.name,
        deploymentStatus: schema.resourcesTable.deploymentStatus,
        details: schema.resourcesTable.details,
        groupName: schema.resourcesTable.groupName,
        isActive: schema.resourcesTable.isActive,
        ownerAddress: sql<Address>`${schema.resourcesTable.ownerAddress}`,
        offerId: schema.resourcesTable.offerId,
        providerId: schema.resourcesTable.providerId,
        providerAddress: sql<Address>`${schema.providersTable.ownerAddress}`,
        ptAddress: sql<Address>`${ptAddress}`,
      })
      .from(schema.resourcesTable)
      .innerJoin(
        schema.providersTable,
        eq(schema.providersTable.id, schema.resourcesTable.providerId)
      )
      .$dynamic();
  }

  async getDetailFiles(cids: string[]) {
    return await this.client
      .select()
      .from(schema.detailFilesTable)
      .where(or(...cids.map((cid) => eq(schema.detailFilesTable.cid, cid))));
  }

  /**
   * Gets Protocol from the database.
   */
  async getProtocol(address: Address) {
    const [pt] = await this.client
      .select()
      .from(schema.protocolsTable)
      .where(eq(schema.protocolsTable.address, address));

    return pt;
  }

  async getProvider(ownerAddress: Address) {
    const [provider] = await this.client
      .select()
      .from(schema.providersTable)
      .where(eq(schema.providersTable.ownerAddress, ownerAddress));

    return provider;
  }

  async getVirtualProvidersByGatewayProviderId(id: number) {
    return await this.client
      .select()
      .from(schema.providersTable)
      .where(eq(schema.providersTable.gatewayProviderId, id));
  }

  async saveVirtualProviderOfferConfiguration(params: {
    offerId: number;
    protocolAddress: Address;
    configuration: any;
  }) {
    await this.client.transaction(async (tx) => {
      const [protocol] = await tx
        .select({ id: schema.protocolsTable.id })
        .from(schema.protocolsTable)
        .where(eq(schema.protocolsTable.address, params.protocolAddress));

      if (!protocol) {
        throw new Error(
          `Protocol ${params.protocolAddress} not found while inserting Virtual Provider Offer (ID: ${params.offerId}) configuration`
        );
      }

      await tx
        .insert(schema.virtualProviderOfferConfigurations)
        .values({
          id: params.offerId,
          ptAddressId: protocol.id,
          configuration: params.configuration,
        })
        .onConflictDoUpdate({
          target: [
            schema.virtualProviderOfferConfigurations.id,
            schema.virtualProviderOfferConfigurations.ptAddressId,
          ],
          set: {
            configuration: params.configuration,
          },
        });
    });
  }

  async updateVirtualProviderConfiguration(
    offerId: number,
    protocolAddress: Address,
    configuration: any
  ) {
    const protocol = await this.getProtocol(
      protocolAddress.toLowerCase() as Address
    );

    if (!protocol) {
      throw new Error(`Protocol not found`);
    }

    await this.client
      .update(schema.virtualProviderOfferConfigurations)
      .set({
        configuration,
      })
      .where(
        and(
          eq(
            schema.virtualProviderOfferConfigurations.ptAddressId,
            protocol.id
          ),
          eq(schema.virtualProviderOfferConfigurations.id, offerId)
        )
      );
  }

  async getVirtualProviderConfiguration(
    offerId: number,
    protocolAddress: Address
  ) {
    const protocol = await this.getProtocol(
      protocolAddress.toLowerCase() as Address
    );
    if (!protocol) {
      return;
    }

    const [row] = await this.client
      .select()
      .from(schema.virtualProviderOfferConfigurations)
      .where(
        and(
          eq(schema.virtualProviderOfferConfigurations.id, offerId),
          eq(schema.virtualProviderOfferConfigurations.ptAddressId, protocol.id)
        )
      );

    return row?.configuration;
  }

  async insertDetailFile(content: string) {
    const cid = await generateCID(content);
    const [value] = await this.client
      .insert(schema.detailFilesTable)
      .values({
        cid: cid.toString(),
        content,
      })
      .onConflictDoUpdate({
        target: [schema.detailFilesTable.cid],
        set: {
          cid: cid.toString(),
          content,
        },
      })
      .returning();

    return value!.cid;
  }

  /**
   * @deprecated Use `syncDetailFiles` instead
   */
  async saveDetailFiles(contents: string[]) {
    return this.syncDetailFiles(contents);
  }
  async syncDetailFiles(contents: string[]) {
    const values: schema.DbDetailFileInsert[] = [];

    for (const content of contents) {
      const cid = await generateCID(content);
      values.push({
        cid: cid.toString(),
        content: content,
      });
    }

    await this.client.transaction(async (tx) => {
      // Only delete detail files that are not given
      await tx.delete(schema.detailFilesTable).where(
        not(
          inArray(
            schema.detailFilesTable.cid,
            values.map((v) => v.cid)
          )
        )
      );

      if (values.length === 0) {
        return;
      }

      // Insert them
      await tx
        .insert(schema.detailFilesTable)
        .values(values)
        .onConflictDoNothing(); // skip the ones that already presented
    });
  }

  async saveProvider(
    id: number,
    ownerAddress: Address,
    isVirtual?: boolean,
    gatewayProviderId?: number
  ) {
    ownerAddress = ownerAddress.toLowerCase() as Address;
    await this.client
      .insert(schema.providersTable)
      .values({
        id,
        ownerAddress,
        isVirtual,
        gatewayProviderId,
      })
      .onConflictDoUpdate({
        target: [schema.providersTable.id],
        set: {
          ownerAddress,
          isVirtual,
          gatewayProviderId,
        },
      });
  }

  /**
   * Saves a Protocol to the database.
   * @param address Smart contract address of the Protocol.
   */
  async upsertProtocol(address: Address, detailsLink: any) {
    await this.client.transaction(async (tx) => {
      const [pt] = await tx
        .select()
        .from(schema.protocolsTable)
        .where(eq(schema.protocolsTable.address, address));

      const [detailFile] = await tx
        .select({
          id: schema.detailFilesTable.id,
        })
        .from(schema.detailFilesTable)
        .where(eq(schema.detailFilesTable.cid, detailsLink));

      if (!detailFile) {
        throw new Error(
          `Details file not found for Protocol ${address}. Please be sure you've placed the details of the Protocol into "data/details/[filename]"`
        );
      }

      // TODO: Update Protocol
      if (pt) {
        return;
      }

      await tx.insert(schema.protocolsTable).values({
        address,
      });
    });
  }

  async getConfig(key: string) {
    const [config] = await this.client
      .select()
      .from(schema.configTable)
      .where(eq(schema.configTable.key, key));
    return config?.value;
  }

  async setConfig(key: string, value: string) {
    await this.client
      .insert(schema.configTable)
      .values({
        key,
        value,
      })
      .onConflictDoUpdate({
        target: [schema.configTable.key],
        set: {
          value,
        },
      });
  }

  async addFaucetUsage(requesterAddress: Address) {
    await this.client.insert(schema.faucetUsages).values({
      address: requesterAddress,
    });
  }

  async getLatestFaucetRequest(requesterAddress: Address) {
    const [usage] = await this.client
      .select()
      .from(schema.faucetUsages)
      .where(eq(schema.faucetUsages.address, requesterAddress))
      .orderBy(desc(schema.faucetUsages.requestedAt));

    // TODO: No need to use type conversion once the tsconfig is done correctly
    return usage as typeof usage | undefined;
  }
}

export const DB = new Database();
