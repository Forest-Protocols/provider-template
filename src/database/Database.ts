import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "@/config";
import {
  DeploymentStatus,
  NotInitialized,
  ProviderDetails,
} from "@forest-protocols/sdk";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { Address } from "viem/accounts";
import { DbOffer, Resource } from "@/types";
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
    pcAddress: Address,
    values: {
      name?: string;
      details?: any;
      deploymentStatus?: any;
      groupName?: string;
      isActive?: boolean;
    }
  ) {
    const pc = await this.getProductCategory(pcAddress);

    if (!pc) {
      this.logger.error(
        `Product category not found ${pcAddress} while looking for the resource #${id}`
      );
      return;
    }

    await this.client
      .update(schema.resourcesTable)
      .set(values)
      .where(
        and(
          eq(schema.resourcesTable.id, id),
          eq(schema.resourcesTable.pcAddressId, pc.id)
        )
      );
  }

  /**
   * Marks a resource record as deleted (not active) and deletes its details.
   */
  async deleteResource(id: number, pcAddress: Address) {
    await this.updateResource(id, pcAddress, {
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

  async getAllOffers(pcAddress?: Address) {
    return await this.offerQuery().where(
      and(
        pcAddress
          ? eq(schema.productCategoriesTable.address, pcAddress.toLowerCase())
          : undefined
      )
    );
  }

  /**
   * Retrieves details of a resource.
   * @param id
   */
  async getResource(
    id: number,
    ownerAddress: string,
    pcAddress: Address
  ): Promise<Resource | undefined> {
    const pc = await this.getProductCategory(pcAddress);

    if (!pc) {
      return;
    }

    const [resource] = await this.resourceQuery().where(
      and(
        eq(schema.resourcesTable.id, id),
        eq(schema.resourcesTable.ownerAddress, ownerAddress),
        eq(schema.resourcesTable.pcAddressId, pc.id)
      )
    );

    if (!resource) return;

    return {
      id: resource.id,
      name: resource.name,
      deploymentStatus: resource.deploymentStatus,
      details: resource.details,
      groupName: resource.groupName,
      isActive: resource.isActive,
      ownerAddress: resource.ownerAddress as Address,
      offer: {
        provider: {
          id: resource.provider.id,
          details: resource.provider.details,
          ownerAddress: resource.provider.ownerAddress as Address,
        },
        details: resource.offer.details,
        id: resource.offer.id,
        productCategory: resource.productCategory.address as Address,
      },
    };
  }

  resourceQuery() {
    return this.client
      .select({
        ...getTableColumns(schema.resourcesTable),
        offer: schema.offersTable,
        provider: schema.providersTable,
        productCategory: schema.productCategoriesTable,
      })
      .from(schema.resourcesTable)
      .innerJoin(
        schema.offersTable,
        and(
          eq(schema.resourcesTable.offerId, schema.offersTable.id),
          eq(schema.resourcesTable.pcAddressId, schema.offersTable.pcAddressId)
        )
      )
      .innerJoin(
        schema.providersTable,
        eq(schema.resourcesTable.providerId, schema.providersTable.id)
      )
      .innerJoin(
        schema.productCategoriesTable,
        eq(schema.offersTable.pcAddressId, schema.productCategoriesTable.id)
      )
      .$dynamic();
  }

  offerQuery() {
    return this.client
      .select({
        id: schema.offersTable.id,
        deploymentParams: schema.offersTable.deploymentParams,
        details: schema.offersTable.details,
        productCategory: sql<Address>`${schema.productCategoriesTable.address}`,
      })
      .from(schema.offersTable)
      .innerJoin(
        schema.providersTable,
        eq(schema.offersTable.providerId, schema.providersTable.id)
      )
      .innerJoin(
        schema.productCategoriesTable,
        eq(schema.offersTable.pcAddressId, schema.productCategoriesTable.id)
      )
      .$dynamic();
  }

  /**
   * Gets one product category info stored in the database.
   */
  async getProductCategory(
    address: Address
  ): Promise<schema.DbProductCategory | undefined>;
  /**
   * Gets all product categories in the database
   * @param address
   */
  async getProductCategory(
    address?: Address
  ): Promise<schema.DbProductCategory[]>;
  async getProductCategory(
    address?: Address
  ): Promise<
    schema.DbProductCategory | schema.DbProductCategory[] | undefined
  > {
    const pcs = await this.client
      .select()
      .from(schema.productCategoriesTable)
      .where(
        and(
          address !== undefined
            ? eq(schema.productCategoriesTable.address, address?.toLowerCase())
            : undefined
        )
      );

    if (address) {
      return pcs[0];
    }
    pcs;
  }

  async getAllOffersOfProvider(
    providerIdOrAddress: number | Address,
    pcAddress?: Address
  ): Promise<DbOffer[]> {
    const offers = await this.offerQuery().where(
      and(
        typeof providerIdOrAddress === "string"
          ? eq(
              schema.providersTable.ownerAddress,
              providerIdOrAddress.toLowerCase()
            )
          : eq(schema.providersTable.id, providerIdOrAddress),
        pcAddress
          ? eq(schema.productCategoriesTable.address, pcAddress.toLowerCase())
          : undefined
      )
    );

    return offers;
  }

  async getOffer(id: number, pcAddress: Address): Promise<DbOffer | undefined> {
    const pc = await this.getProductCategory(pcAddress);

    if (!pc) {
      return;
    }

    const [offer] = await this.client
      .select()
      .from(schema.offersTable)
      .where(
        and(
          eq(schema.offersTable.id, id),
          eq(schema.offersTable.pcAddressId, pc.id)
        )
      );

    return {
      id: offer.id,
      deploymentParams: offer.deploymentParams,
      details: offer.details,
      productCategory: pcAddress,
    };
  }

  /**
   * Retrieve all of the details about the provider itself
   */
  async getProviderDetails(
    providerIdOrAddress: Address | number
  ): Promise<ProviderDetails | undefined> {
    const [result] = await this.client
      .select()
      .from(schema.providersTable)
      .where(
        typeof providerIdOrAddress === "string"
          ? eq(
              schema.providersTable.ownerAddress,
              providerIdOrAddress.toLowerCase()
            )
          : eq(schema.providersTable.id, providerIdOrAddress)
      );

    if (!result) {
      return;
    }

    return result.details;
  }

  /**
   * Returns the latest processed block height for a provider.
   */
  async getLatestProcessedBlockHeight(): Promise<bigint | undefined> {
    const [lastBlock] = await this.client
      .select()
      .from(schema.blockchainTxsTable)
      .orderBy(desc(schema.blockchainTxsTable.height))
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
  async saveTxAsProcessed(blockHeight: bigint, hash: string) {
    await this.client.transaction(async (tx) => {
      const [transaction] = await tx
        .select()
        .from(schema.blockchainTxsTable)
        .where(eq(schema.blockchainTxsTable.height, blockHeight));

      if (!transaction) {
        await tx.insert(schema.blockchainTxsTable).values({
          height: blockHeight,
          isProcessed: true,
          hash,
        });
      } else if (transaction.isProcessed === false) {
        await tx
          .update(schema.blockchainTxsTable)
          .set({ isProcessed: true })
          .where(eq(schema.blockchainTxsTable.height, blockHeight));
      }
    });
  }

  async saveProvider(id: number, details: any, ownerAddress: Address) {
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

      if (existingProvider) {
        return;
      }

      await tx.insert(schema.providersTable).values({
        id,
        details,
        ownerAddress: ownerAddress,
      });
    });
  }

  async saveOffer(
    id: number,
    providerId: number,
    pcAddress: Address,
    deploymentParams: any,
    details: any
  ) {
    pcAddress = pcAddress.toLowerCase() as Address;
    await this.client.transaction(async (tx) => {
      const [pc] = await tx
        .select()
        .from(schema.productCategoriesTable)
        .where(eq(schema.productCategoriesTable.address, pcAddress));

      if (!pc) {
        throw new Error(
          `Product category not found in the database: ${pcAddress}`
        );
      }

      const [existingOffer] = await tx
        .select()
        .from(schema.offersTable)
        .where(
          and(
            eq(schema.offersTable.id, id),
            eq(schema.offersTable.pcAddressId, pc.id)
          )
        );

      if (existingOffer) {
        return;
      }

      await tx.insert(schema.offersTable).values({
        details,
        deploymentParams,
        id,
        pcAddressId: pc.id,
        providerId,
      });
    });
  }

  /**
   * Saves a product category to the database.
   * Does nothing if it is already saved.
   * @param address Smart contract address of the product category.
   */
  async saveProductCategory(address: Address, details: any) {
    address = address.toLowerCase() as Address;
    await this.client.transaction(async (tx) => {
      const [existingPc] = await tx
        .select()
        .from(schema.productCategoriesTable)
        .where(eq(schema.productCategoriesTable.address, address));

      if (existingPc) {
        return;
      }

      await tx.insert(schema.productCategoriesTable).values({
        details,
        address,
      });
    });
  }
}

export const DB = new Database();
