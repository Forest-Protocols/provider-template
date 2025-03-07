import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "@/config";
import { DeploymentStatus, generateCID } from "@forest-protocols/sdk";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { Address } from "viem/accounts";
import { Resource } from "@/types";
import { logger } from "@/logger";
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
      and(eq(schema.resourcesTable.ownerAddress, ownerAddress))
    );
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
      .where(eq(schema.protocolsTable.address, address?.toLowerCase()));

    return pt;
  }

  /**
   * Returns the latest processed block height for a provider.
   */
  async getLatestProcessedBlockHeight(): Promise<bigint | undefined> {
    const [lastBlock] = await this.client
      .select()
      .from(schema.blockchainTxsTable)
      .limit(1);

    return lastBlock?.height;
  }

  async getProvider(ownerAddress: string) {
    const [provider] = await this.client
      .select()
      .from(schema.providersTable)
      .where(eq(schema.providersTable.ownerAddress, ownerAddress));

    if (!provider) {
      throw new PipeErrorNotFound(`Provider ${ownerAddress}`);
    }

    return provider;
  }

  /**
   * Retrieves a transaction from the database.
   * @param blockHeight
   * @param hash
   */
  async getTransaction(blockHeight: bigint, hash: string) {
    const [tx] = await this.client
      .select()
      .from(schema.blockchainTxsTable)
      .where(
        and(
          eq(schema.blockchainTxsTable.height, blockHeight),
          eq(schema.blockchainTxsTable.hash, hash)
        )
      );

    return tx;
  }

  /**
   * Saves a transaction as processed
   * @param blockHeight
   */
  async saveTransaction(blockHeight: bigint, hash: string) {
    await this.client.transaction(async (tx) => {
      const [transaction] = await tx
        .select()
        .from(schema.blockchainTxsTable)
        .where(
          and(
            eq(schema.blockchainTxsTable.height, blockHeight),
            eq(schema.blockchainTxsTable.hash, hash)
          )
        );

      if (transaction) return;

      await this.client.insert(schema.blockchainTxsTable).values({
        height: blockHeight,
        hash,
      });
    });
  }

  /**
   * Deletes all of the records that belongs to a particular block height
   */
  async clearBlocks(blockHeight: bigint) {
    await this.client
      .delete(schema.blockchainTxsTable)
      .where(eq(schema.blockchainTxsTable.height, blockHeight));
  }

  async saveDetailFiles(contents: string[]) {
    const values: schema.DbDetailFileInsert[] = [];

    for (const content of contents) {
      const cid = await generateCID(content);
      values.push({
        cid: cid.toString(),
        content: content,
      });
    }

    await this.client.transaction(async (tx) => {
      await tx.delete(schema.detailFilesTable);

      await tx
        .insert(schema.detailFilesTable)
        .values(values)
        .onConflictDoNothing();
    });
  }

  async upsertProvider(id: number, detailsLink: string, ownerAddress: Address) {
    ownerAddress = ownerAddress.toLowerCase() as Address;
    await this.client.transaction(async (tx) => {
      const [existingProvider] = await tx
        .select()
        .from(schema.providersTable)
        .where(
          and(
            eq(schema.providersTable.ownerAddress, ownerAddress),
            eq(schema.providersTable.id, id)
          )
        );

      const [detailFile] = await tx
        .select({
          id: schema.detailFilesTable.id,
        })
        .from(schema.detailFilesTable)
        .where(eq(schema.detailFilesTable.cid, detailsLink));

      if (!detailFile) {
        throw new Error(
          `Details file not found for Provider ${id}. Please be sure you've placed the details of the provider into "data/details/[filename].json"`
        );
      }

      if (existingProvider) {
        // TODO: Update provider
        return;
      }

      await tx.insert(schema.providersTable).values({
        id,
        ownerAddress: ownerAddress,
      });
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
        .where(eq(schema.protocolsTable.address, address.toLowerCase()));

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
        address: address.toLowerCase(),
      });
    });
  }
}

export const DB = new Database();
