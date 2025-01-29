import { rpcClient } from "@/clients";
import { config } from "@/config";
import { DB } from "@/database/Database";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { logger } from "@/logger";
import { OfferDetails, Resource, ResourceDetails } from "@/types";
import {
  addressSchema,
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
import { red } from "ansis";
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
  /**
   * Communication pipe to let users to interact with their resources.
   */
  pipe!: XMTPPipe;

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
        `Provider config not found for provider tag "${providerTag}". Please check your data/providers.json and providers object within src/index.ts`
      );
      process.exit(1);
    }

    this.details = providerConfig.details;

    // Initialize pipe
    this.pipe = new XMTPPipe(
      providerConfig.operatorWalletPrivateKey as Address
    );

    // Disable console.info to get rid out of "XMTP dev" warning
    const consoleInfo = console.info;
    console.info = () => {};

    // Use dev env only for local and sepolia chains
    await this.pipe.init(config.CHAIN === "optimism" ? "production" : "dev");

    // Revert back console.info
    console.info = consoleInfo;

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

    // Setup standard pipe routes

    /**
     * Retrieve all of the offers that made by the provider.
     */
    this.pipe.route(PipeMethod.GET, "/offers", async (_) => {
      const offers = (
        await DB.getAllOffersOfProvider(this.actorInfo.ownerAddr)
      ).map((offer) => ({
        ...offer,
        deploymentParams: undefined, // No need to send it to the user
      }));
      return {
        code: PipeResponseCode.OK,
        body: offers,
      };
    });

    /**
     * Retrieve details about provider itself.
     */
    this.pipe.route(PipeMethod.GET, "/details", async (_) => {
      const details = await DB.getProviderDetails(this.actorInfo.ownerAddr);

      return {
        code: PipeResponseCode.OK,
        body: details,
      };
    });

    /**
     * Retrieves a product category details (if it is available within this provider)
     */
    this.pipe.route(PipeMethod.GET, "/product-category", async (req) => {
      const params = validateBodyOrParams(
        req.params,
        z.object({
          pc: addressSchema,
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
     * Retrieve details (e.g credentials) of a resource.
     */
    this.pipe.route(PipeMethod.GET, "/resource", async (req) => {
      const params = validateBodyOrParams(
        req.params,
        z.object({
          /** ID of the resource. */
          id: z.number(),

          /** Product category address that the resource created in. */
          pc: addressSchema, // A pre-defined Zod schema for smart contract addresses.
        })
      );

      // NOTE:
      // Since XMTP has its own authentication layer, we don't need to worry about
      // if this request really sent by the owner of the resource. So if the sender is
      // different from owner of the resource, basically the resource won't be found because
      // we are looking to the database with an agreement id + requester address + product category address.
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

      return {
        code: PipeResponseCode.OK,
        body: {
          ...resource,
          details, // Use filtered details
        },
      };
    });
  }

  /**
   * Creates the actual resource based. Called based on the blockchain agreement creation event.
   * @param agreement On-chain agreement of the resource
   * @param offer Offer details stored in the database
   */
  abstract create(agreement: Agreement, offer: OfferDetails): Promise<T>;

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
