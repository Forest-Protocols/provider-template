import { config } from "@/config";
import { LocalStorage } from "@/database/LocalStorage";
import { DbOffer, Resource } from "@/database/schema";
import { NotFound } from "@/errors/NotFound";
import { ResourceDetails } from "@/types";
import {
  Agreement,
  PipeMethod,
  PipeResponseCode,
  XMTPPipe,
} from "@forest-protocols/sdk";
import { Address } from "viem";

/**
 * Abstract provider that needs to be extended by the Product Category Owner.
 * @responsible Admin
 */
export abstract class AbstractProvider<T extends ResourceDetails> {
  /**
   * Communication pipe to let users to interact with their resources.
   */
  pipe = new XMTPPipe(config.OPERATOR_WALLET_PRIVATE_KEY as Address);

  /**
   * Initializes the provider if it needs some async operation to be done before start to use it.
   */
  async init(): Promise<void> {
    // Initialize pipe
    await this.pipe.init({
      chain: config.CHAIN,
      rpcHost: config.RPC_HOST,
      env: "dev",
    });

    // A shorthand for global local storage
    const localStorage = LocalStorage.instance;

    // Setup pipe standard pipe routes

    /**
     * Retrieve all of the offers that made by the provider.
     * method: GET
     * path: /offers
     */
    this.pipe.route(PipeMethod.GET, "/offers", async (req) => {
      return {
        code: PipeResponseCode.OK,
        body: await localStorage.getOffers(),
      };
    });

    /**
     * Retrieve details about provider itself.
     * method: GET
     * path: /details
     */
    this.pipe.route(PipeMethod.GET, "/details", async (req) => {
      const details = await localStorage.getProviderDetails();

      return {
        code: PipeResponseCode.OK,
        body: details,
      };
    });

    /**
     * Retrieve details (e.g credentials) of a resource.
     * method: GET
     * path: /resource
     * params:
     *  id: number -> ID of the resource
     */
    this.pipe.route(PipeMethod.GET, "/resource", async (req) => {
      try {
        // NOTE:
        // Since XMTP has its own authentication layer, we don't need to worry about
        // if this request really sent by the owner of the resource. So if the sender is
        // different from owner of the resource, basically the resource won't be found because
        // we are looking to the local database with an agreement id + requester address pair.
        const resource = await localStorage.getResource(
          req.params!.id,
          req.requester
        );

        return {
          code: PipeResponseCode.OK,
          body: resource,
        };
      } catch (err) {
        if (err instanceof NotFound) {
          return {
            code: PipeResponseCode.NOT_FOUND,
          };
        }
      }

      return {
        code: PipeResponseCode.INTERNAL_SERVER_ERROR,
      };
    });
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
