import {
  addressSchema,
  Agreement,
  PipeError,
  PipeMethod,
  PipeResponseCode,
  validateBodyOrParams,
} from "@forest-protocols/sdk";
import { AbstractProvider } from "@/abstract/AbstractProvider";
import { Resource, ResourceDetails } from "@/types";
import { DB } from "@/database/Database";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { z } from "zod";
import { Address } from "viem";

/**
 * The details gathered by the provider from the resource source.
 * This is the "details" type of each resource and it is stored in the database.
 * @responsible Product Category Owner
 */
export type MachineTranslationDetails = ResourceDetails & {};

/**
 * Base provider that defines what kind of actions needs to be implemented for the product category.
 * @responsible Product Category Owner
 */
export abstract class BaseMachineTranslationProvider extends AbstractProvider<MachineTranslationDetails> {
  abstract translate(
    options: {
      from: string;
      to: string;
    },
    agreement: Agreement,
    resource: Resource,
  ): Promise<any>;

  /**
   * An example function that represents product specific action. This
   * function has to be implemented by all of the providers that wants
   * to provide this product.
   *
   * The definition is up to product category owner. So if some of the
   * arguments are not needed, they can be deleted. Like `agreement` or
   * `resource` can be deleted if they are unnecessary for the implementation.
   * @param agreement On-chain agreement data.
   * @param resource Resource information stored in the database.
   * @param additionalArgument Extra argument that related to the functionality (if needed).
   */
  abstract doSomething(
    agreement: Agreement,
    resource: Resource,
    additionalArgument: string
  ): Promise<{ stringResult: string; numberResult: number }>;

  async init(providerTag: string) {
    // Base class' `init` function must be called.
    await super.init(providerTag);

    /**
     * If your product has some functionalities/interactions (like "doSomething" method)
     * you can define "Pipe" routes to map the incoming requests from end users to the
     * corresponding methods.
     *
     * Pipe is a simple abstraction layer that allow the participants to communicate
     * HTTP like request-response style communication between them.
     *
     * Take a look at the example below:
     */

    /** Calls "doSomething" method. */
    this.pipe.route(PipeMethod.GET, "/do-something", async (req) => {
      /**
       * Validates the params/body of the request. If they are not valid
       * request will reply back to the user with a validation error message
       * and bad request code automatically.
       */
      const body = validateBodyOrParams(
        req.body,
        z.object({
          /** ID of the resource. */
          id: z.number(),

          /** Product category address that the resource created in. */
          pc: addressSchema, // A pre-defined Zod schema for smart contract addresses.

          /** Additional argument for the method. */
          argument: z.string(),
        })
      );

      /**
       * Retrieve the resource from the database.
       *
       * IMPORTANT NOTE:
       * Inside your route handlers, you always need to use `req.requester` when
       * you retrieve resource from the database. With that approach you can be
       * sure that the requester is the owner of the resource (because otherwise the resource
       * won't be found). Basically the authorization stuff. If you want to add more logic
       * for the authorization (like call limiting etc.) you can do as well next to retrieving resource process.
       */

      const resource = await DB.getResource(
        body.id,
        req.requester,
        body.pc as Address
      );

      // If resource is not found or not active, throws a not found error.
      // "Active" means; is the agreement still active on-chain?
      if (!resource || !resource.isActive) {
        throw new PipeErrorNotFound("Resource");
      }

      const pc = this.productCategories[body.pc]; // Product category client.
      const agreement = await pc.getAgreement(resource.id); // Retrieve the agreement details from chain

      // Call the actual method and store the results of it.
      const result = await this.doSomething(agreement, resource, body.argument);

      // Return the response with the results.
      return {
        code: PipeResponseCode.OK,
        body: result,
      };
    });
  }
}
