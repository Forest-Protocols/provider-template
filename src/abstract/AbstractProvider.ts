import { rpcClient } from "@/clients";
import { config } from "@/config";
import { DB } from "@/database/Database";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { logger } from "@/logger";
import { pipeOperatorRoute, pipes, providerPipeRoute } from "@/pipe";
import {
  DbOffer,
  ProviderPipeRouteHandler,
  Resource,
  ResourceDetails,
} from "@/types";
import {
  addressSchema,
  PipeError,
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

  productCategories: { [address: string]: ProductCategory } = {};

  account!: Account;

  actorInfo!: Provider;

  details!: ProviderDetails;

  /**
   * Initializes the provider if it needs some async operation to be done before start to use it.
   */
  async init(providerTag: string): Promise<void> {
    const providerConfig = config.providers[providerTag];

    if (!providerConfig) {
      logger.error(
        `Provider config not found for provider tag "${providerTag}". Please check your data/providers.json and be sure this tag is associated with a provider class in src/index.ts - Beginning of the Program class`
      );
      process.exit(1);
    }

    this.details = providerConfig.details;

    // Setup provider account
    this.account = privateKeyToAccount(
      providerConfig.providerWalletPrivateKey as Address
    );

    // Initialize Forest Protocols clients
    this.registry = Registry.createWithClient(rpcClient, this.account);

    const provider = await this.registry.getActor(this.account.address);
    if (!provider) {
      logger.error(
        red(
          `Provider address "${this.account.address}" is not registered in the protocol. Please register the provider and try again.`
        )
      );
      process.exit(1);
    }

    this.actorInfo = provider;

    const productCategories = await this.registry.getRegisteredPCsOfProvider(
      provider.id
    );
    console.log(productCategories)

    // Save the provider information into the database
    await DB.saveProvider(
      this.actorInfo.id,
      this.details,
      this.actorInfo.ownerAddr
    );

    for (const pcAddress of productCategories) {
      const pcInfo = config.productCategories[pcAddress.toLowerCase()];
      if (!pcInfo) {
        logger.error(
          red(
            `Product category ${pcAddress} details are not available inside data/product-categories directory. Please define the details of the product category and try again`
          )
        );
        process.exit(1);
      }

      const pc = ProductCategory.createWithClient(
        rpcClient,
        pcAddress as Address,
        this.account
      );
      const offers = await pc.getAllProviderOffers(this.actorInfo.ownerAddr);

      await DB.saveProductCategory(
        pcAddress.toLowerCase() as Address,
        pcInfo.details
      );

      // Save offer details to the database
      for (const offer of offers) {
        // Only pick the offers are registered on chain
        const offerData = config.offers[pcAddress.toLowerCase()].find(
          (offerInfo) => offerInfo.id == offer.id
        );

        // Only save this offer if details are defined for it
        if (offerData) {
          await DB.saveOffer(
            offer.id,
            this.actorInfo.id,
            pcAddress.toLowerCase() as Address,
            offerData.deploymentParams,
            offerData.details
          );
        } else {
          logger.warning(
            `Offer ${offer.id} is committed to block chain in product category ${pcAddress} but details not found in data/offers directory.`
          );
        }
      }

      this.productCategories[pcAddress.toLowerCase()] = pc;
    }

    // Initialize pipe for this operator address if it is not instantiated yet.
    if (!pipes[this.actorInfo.operatorAddr]) {
      pipes[this.actorInfo.operatorAddr] = new XMTPPipe(
        providerConfig.operatorWalletPrivateKey as Address
      );
      // Disable console.info to get rid out of "XMTP dev" warning
      const consoleInfo = console.info;
      console.info = () => {};

      // Use dev env only for local and sepolia chains
      await pipes[this.actorInfo.operatorAddr].init(
        config.CHAIN === "optimism" ? "production" : "dev"
      );

      // Revert back console.info
      console.info = consoleInfo;

      logger.info(
        `Initialized Pipe for operator ${yellow.bold(
          this.actorInfo.operatorAddr
        )}`
      );

      // Setup operator specific endpoints

      /**
       * Retrieves details of a product category
       */
      this.operatorRoute(PipeMethod.GET, "/product-categories", async (req) => {
        const params = validateBodyOrParams(
          req.params,
          z.object({
            /**
             * Product category address
             */
            pc: addressSchema.optional(),
          })
        );

        const pc = await DB.getProductCategory(params.pc as Address);

        if (!pc) {
          throw new PipeErrorNotFound("Product category");
        }

        return {
          code: PipeResponseCode.OK,
          body: pc.details,
        };
      });

      /**
       * Retrieve details (e.g credentials) of all or just a single resource.
       */
      this.operatorRoute(PipeMethod.GET, "/resources", async (req) => {
        const params = validateBodyOrParams(
          req.params,
          z.object({
            /** ID of the resource. */
            id: z.number().optional(),

            /** Product category address that the resource created in. */
            pc: addressSchema.optional(), // A pre-defined Zod schema for smart contract addresses.
          })
        );

        // If not both of them are given
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
          params.pc as Address
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

      /**
       * Retrieves all of the offers that registered in this daemon
       */
      this.operatorRoute(PipeMethod.GET, "/offers", async (req) => {
        const params = validateBodyOrParams(
          req.params,
          z.object({
            /**
             * Product category address
             */
            pc: addressSchema.optional(),

            /**
             * ID of the offer.
             */
            id: z.number().optional(),

            providerId: z.number().optional(),
          })
        );

        let offers: DbOffer[] = [];

        // Retrieve a specific Offer from a specific product category
        if (params.id !== undefined) {
          if (params.pc === undefined) {
            throw new PipeError(PipeResponseCode.BAD_REQUEST, {
              message: "'pc' param must be used with 'id' param",
            });
          }

          const offer = await DB.getOffer(params.id, params.pc as Address);
          if (!offer) {
            throw new PipeErrorNotFound(`Offer ${params.id} in ${params.pc}`);
          }

          return {
            code: PipeResponseCode.OK,
            body: {
              ...offer,
              deploymentParams: undefined, // No need to send it to the user
            },
          };
        } else if (params.providerId !== undefined) {
          // Retrieve all offers of the given provider
          offers = await DB.getAllOffersOfProvider(
            params.providerId,
            params.pc as Address
          );
        } else {
          // Retrieve all offers exists in this daemon
          // or retrieve all offers from the given PC (if it is there)
          offers = await DB.getAllOffers(params.pc as Address);
        }

        return {
          code: PipeResponseCode.OK,
          body: offers.map((offer) => ({
            ...offer,
            deploymentParams: undefined, // No need to send it to the user
          })),
        };
      });
    }

    // Setup provider specific Pipe endpoints

    /**
     * Retrieves details of the provider.
     */
    this.route(PipeMethod.GET, "/details", async (req) => {
      return {
        code: PipeResponseCode.OK,
        body: await DB.getProviderDetails(req.providerId),
      };
    });
  }

  /**
   * Gets the Product Category client from the registered product category list of this provider.
   */
  getPcClient(pcAddress: Address) {
    return this.productCategories[pcAddress.toLowerCase()];
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
      resource.offer.provider.id != this.actorInfo.id // Resource doesn't belong to this provider
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
   * @param agreement On-chain agreement of the resource
   * @param offer Offer details stored in the database
   */
  abstract create(agreement: Agreement, offer: DbOffer): Promise<T>;

  /**
   * Fetches/retrieves the details about the resource from the resource itself
   * @param agreement On-chain agreement of the resource
   * @param resource The details stored inside the database
   */
  abstract getDetails(agreement: Agreement, resource: Resource): Promise<T>;

  /**
   * Deletes the actual resource based. Called based on the blockchain agreement closing event.
   * @param agreement On-chain agreement of the resource
   * @param resource The details stored inside the database
   */
  abstract delete(agreement: Agreement, resource: Resource): Promise<T>;
}
