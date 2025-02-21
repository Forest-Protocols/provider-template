import { rpcClient } from "@/clients";
import { config } from "@/config";
import { DB } from "@/database/Database";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { logger } from "@/logger";
import { pipeOperatorRoute, pipes, providerPipeRoute } from "@/pipe";
import {
  DetailedOffer,
  ProviderPipeRouteHandler,
  Resource,
  ResourceDetails,
} from "@/types";
import { tryParseJSON } from "@/utils";
import {
  addressSchema,
  PipeRouteHandler,
  Provider,
  ProviderDetails,
  validateBodyOrParams,
} from "@forest-protocols/sdk";
import {
  Agreement,
  PipeMethod,
  PipeResponseCode,
  ProductCategory,
  Registry,
  XMTPPipe,
} from "@forest-protocols/sdk";
import { red, yellow } from "ansis";
import { Account, Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

/**
 * Abstract provider that needs to be extended by the Product Category Owner.
 * @responsible Admin
 */
export abstract class AbstractProvider<
  T extends ResourceDetails = ResourceDetails
> {
  registry!: Registry;

  pcClients: { [address: string]: ProductCategory } = {};

  account!: Account;

  actorInfo!: Provider;

  details!: ProviderDetails;

  logger = logger.child({ context: this.constructor.name });

  /**
   * Initializes the provider if it needs some async operation to be done before start to use it.
   */
  async init(providerTag: string): Promise<void> {
    try {
      const providerConfig = config.providers[providerTag];
      this.validateProviderConfig(providerConfig, providerTag);

      // Setup Provider account and initialize clients
      this.account = privateKeyToAccount(process.env.PROVIDER_WALLET_PRIVATE_KEY as Address);
      this.registry = Registry.createWithClient(rpcClient, this.account);

      await this.initializeActorInfo();
      await this.initializeProductCategories();
      await this.initializePipe(providerConfig);
      this.setupOperatorRoutes();
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Initialization failed: ${error.message}`);
      } else {
        this.logger.error('Initialization failed: unknown error');
      }
      throw error;
    }
  }

  private validateProviderConfig(providerConfig: any, providerTag: string): void {
    if (!providerConfig) {
      throw new Error(`Provider config not found for provider tag "${providerTag}". Please check your data/providers.json file`);
    }
  }

  private async initializeActorInfo(): Promise<void> {
    this.logger.info("Checking in Protocol Actor information");
    const provider = await this.registry.getActor(this.account.address);
    if (!provider) {
      throw new Error(`Provider address "${this.account.address}" is not registered in the Protocol.`);
    }
    this.actorInfo = provider;

    await DB.upsertProvider(this.actorInfo.id, this.actorInfo.detailsLink, this.actorInfo.ownerAddr);
    const [provDetailFile] = await DB.getDetailFiles([provider.detailsLink]);
    this.details = tryParseJSON(provDetailFile.content);
  }

  private async initializeProductCategories(): Promise<void> {
    const pcAddresses = await this.registry.getRegisteredPCsOfProvider(this.actorInfo.id);
    const pcClientsPromises = pcAddresses.map(async (pcAddress) => {
      this.pcClients[pcAddress.toLowerCase()] = ProductCategory.createWithClient(rpcClient, pcAddress as Address, this.account);
    });
    await Promise.all(pcClientsPromises);
  }

  private async initializePipe(providerConfig: any): Promise<void> {
    if (!pipes[this.actorInfo.operatorAddr]) {
      pipes[this.actorInfo.operatorAddr] = new XMTPPipe(providerConfig.operatorWalletPrivateKey);
      await pipes[this.actorInfo.operatorAddr].init(config.CHAIN === "optimism" ? "production" : "dev");
      this.logger.info(`Initialized Pipe for operator ${yellow.bold(this.actorInfo.operatorAddr)}`);
    }
  }

  private setupOperatorRoutes(): void {
    this.operatorRoute(PipeMethod.GET, "/details", async (req) => {
      const body = validateBodyOrParams(req.body, z.array(z.string()).min(1));
      const files = await DB.getDetailFiles(body);

      if (files.length === 0) {
        throw new PipeErrorNotFound("Detail files");
      }

      return {
        code: PipeResponseCode.OK,
        body: files.map((file) => file.content),
      };
    });

    this.operatorRoute(PipeMethod.GET, "/resources", async (req) => {
      const params = validateBodyOrParams(req.params, z.object({
        id: z.number().optional(),
        pc: addressSchema.optional(),
      }));

      if (params.id === undefined || params.pc === undefined) {
        return {
          code: PipeResponseCode.OK,
          body: await DB.getAllResourcesOfUser(req.requester as Address),
        };
      }

      const resource = await DB.getResource(params.id, req.requester, params.pc as Address);
      if (!resource) {
        throw new PipeErrorNotFound(`Resource ${params.id}`);
      }

      const details = Object.entries(resource.details)
        .filter(([name]) => !name.startsWith("_"))
        .reduce<{ [key: string]: any }>((acc, [name, value]) => {
          acc[name] = value;
          return acc;
        }, {});


      resource.details = details;

      return {
        code: PipeResponseCode.OK,
        body: resource,
      };
    });
  }

  /**
   * Gets the Product Category client from the registered product category list of this provider.
   */
  getPcClient(pcAddress: Address) {
    return this.pcClients[pcAddress.toLowerCase()];
  }

  /**
   * Gets a resource that stored in the database and the corresponding agreement from blockchain
   * @param id ID of the resource/agreement
   * @param pcAddress Product category address
   * @param requester Requester of this resource
   */
  protected async getResource(
    id: number,
    pcAddress: Address,
    requester: string
  ) {
    const resource = await DB.getResource(id, requester, pcAddress);

    if (
      !resource || // Resource does not exist
      !resource.isActive || // Agreement of the resource is closed
      resource.providerId != this.actorInfo.id // Resource doesn't belong to this provider
    ) {
      throw new PipeErrorNotFound("Resource");
    }

    const pcClient = this.getPcClient(pcAddress); // Product category client.
    const agreement = await pcClient.getAgreement(resource.id); // Retrieve the agreement details from chain

    return {
      resource,
      agreement,
      pcClient,
    };
  }

  /**
   * Setups a route handler function in the operator Pipe for this provider.
   * Note: Requests that made to this route has to include either `body.providerId` or `params.providerId` field that points to the provider's ID.
   */
  protected route(
    method: PipeMethod,
    path: `/${string}`,
    handler: ProviderPipeRouteHandler
  ) {
    providerPipeRoute(this, method, path, handler);
  }

  /**
   * Setups a route handler for the provider's operator.
   */
  protected operatorRoute(
    method: PipeMethod,
    path: `/${string}`,
    handler: PipeRouteHandler
  ) {
    pipeOperatorRoute(this.actorInfo.operatorAddr, method, path, handler);
  }

  /**
   * Creates the actual resource based. Called based on the blockchain agreement creation event.
   * @param agreement On-chain Agreement data
   * @param offer On-chain Offer data and details (if exists)
   */
  abstract create(agreement: Agreement, offer: DetailedOffer): Promise<T>;

  /**
   * Fetches/retrieves the details about the resource from the resource itself
   * @param agreement On-chain Agreement data
   * @param offer On-chain Offer data and details (if exists)
   * @param resource Current details stored in the database
   */
  abstract getDetails(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<T>;

  /**
   * Deletes the actual resource based. Called based on the blockchain agreement closing event.
   * @param agreement On-chain Agreement data
   * @param offer On-chain Offer data and details (if exists)
   * @param resource Current details stored in the database
   */
  abstract delete(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<void>;
}
