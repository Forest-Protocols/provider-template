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
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { Account, Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

/**
 * Abstract provider that needs to be extended by the Product Category Owner.
 * @responsible Admin
 */
export abstract class AbstractProvider<
  T extends ResourceDetails = ResourceDetails,
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
    const providerConfig = config.providers[providerTag];

    if (!providerConfig) {
      this.logger.error(
        `Provider config not found for provider tag "${providerTag}". Please check your data/providers.json file`,
      );
      process.exit(1);
    }

    // Setup Provider account
    this.account = privateKeyToAccount(
      providerConfig.providerWalletPrivateKey as Address,
    );

    // Initialize clients
    this.registry = Registry.createWithClient(rpcClient, this.account);

    this.logger.info("Checking in Protocol Actor information");
    const provider = await this.registry.getActor(this.account.address);
    if (!provider) {
      this.logger.error(
        red(
          `Provider address "${this.account.address}" is not registered in the Protocol. Please register it and try again.`,
        ),
      );
      process.exit(1);
    }
    this.actorInfo = provider;

    await DB.upsertProvider(
      this.actorInfo.id,
      this.actorInfo.detailsLink,
      this.actorInfo.ownerAddr,
    );

    // TODO: Validate details schema
    const [provDetailFile] = await DB.getDetailFiles([provider.detailsLink]);

    // `DB.upsertProvider` already checked the existence of the details file
    this.details = tryParseJSON(provDetailFile.content);

    const pcAddresses = await this.registry.getRegisteredPCsOfProvider(
      provider.id,
    );

    for (const pcAddress of pcAddresses) {
      this.pcClients[pcAddress.toLowerCase()] =
        ProductCategory.createWithClient(
          rpcClient,
          pcAddress as Address,
          this.account,
        );
    }

    // Initialize pipe for this operator address if it is not instantiated yet.
    if (!pipes[this.actorInfo.operatorAddr]) {
      pipes[this.actorInfo.operatorAddr] = new XMTPPipe(
        providerConfig.operatorWalletPrivateKey,
      );
      // Disable console.info to get rid out of "XMTP dev" warning
      const consoleInfo = console.info;
      console.info = () => { };

      // Use dev env only for local and sepolia chains
      await pipes[this.actorInfo.operatorAddr].init(
        config.CHAIN === "optimism" ? "production" : "dev",
      );

      // Revert back console.info
      console.info = consoleInfo;

      this.logger.info(
        `Initialized Pipe for operator ${yellow.bold(
          this.actorInfo.operatorAddr,
        )}`,
      );

      // Setup operator specific endpoints

      this.operatorRoute(PipeMethod.GET, "/spec", async (req) => {
        try {
          const possibleSpecFiles = [
            "spec.yaml",
            "spec.json",
            "oas.json",
            "oas.yaml",
          ];
          for (const specFile of possibleSpecFiles) {
            const path = join(process.cwd(), "data", specFile);
            const stat = statSync(path, { throwIfNoEntry: false });

            if (stat && stat.isFile()) {
              const content = readFileSync(path, {
                encoding: "utf-8",
              }).toString();
              return {
                code: PipeResponseCode.OK,
                body: content,
              };
            }
          }
        } catch (err: any) {
          this.logger.error(`Couldn't load OpenAPI spec file: ${err.message}`);
          return {
            code: PipeResponseCode.OK,
            body: "",
          };
        }

        throw new PipeErrorNotFound(`OpenAPI spec file`);
      });

      /**
       * Retrieves detail file(s)
       */
      this.operatorRoute(PipeMethod.GET, "/details", async (req) => {
        const body = validateBodyOrParams(req.body, z.array(z.string()).min(1));
        const files = await DB.getDetailFiles(body);

        if (files.length == 0) {
          throw new PipeErrorNotFound("Detail files");
        }

        return {
          code: PipeResponseCode.OK,
          body: files.map((file) => file.content),
        };
      });

      /**
       * Retrieve details (e.g credentials) of resource(s).
       */
      this.operatorRoute(PipeMethod.GET, "/resources", async (req) => {
        const params = validateBodyOrParams(
          req.params,
          z.object({
            /** ID of the resource. */
            id: z.number().optional(),

            /** Product category address that the resource created in. */
            pc: addressSchema.optional(), // A pre-defined Zod schema for smart contract addresses.
          }),
        );

        // If not both of them are given, send all resources of the requester
        if (params.id === undefined || params.pc === undefined) {
          return {
            code: PipeResponseCode.OK,
            body: await DB.getAllResourcesOfUser(req.requester as Address),
          };
        }

        // NOTE:
        // Since XMTP has its own authentication layer, we don't need to worry about
        // if this request really sent by the owner of the resource. So if the sender is
        // different from owner of the resource, basically the resource won't be found because
        // we are looking to the database with agreement id + requester address + product category address.
        const resource = await DB.getResource(
          params.id,
          req.requester,
          params.pc as Address,
        );

        if (!resource) {
          throw new PipeErrorNotFound(`Resource ${params.id}`);
        }

        // Filter fields that starts with underscore.
        const details: any = {};
        for (const [name, value] of Object.entries(resource.details)) {
          if (name.startsWith("_")) {
            continue;
          }

          details[name] = value;
        }

        resource.details = details; // Use filtered details

        return {
          code: PipeResponseCode.OK,
          body: resource,
        };
      });
    }
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
    requester: string,
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
    handler: ProviderPipeRouteHandler,
  ) {
    providerPipeRoute(this, method, path, handler);
  }

  /**
   * Setups a route handler for the provider's operator.
   */
  protected operatorRoute(
    method: PipeMethod,
    path: `/${string}`,
    handler: PipeRouteHandler,
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
    resource: Resource,
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
    resource: Resource,
  ): Promise<void>;
}
