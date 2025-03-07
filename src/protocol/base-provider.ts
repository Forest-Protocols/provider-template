import {
  addressSchema,
  Agreement,
  PipeMethod,
  PipeResponseCode,
  validateBodyOrParams,
} from "@forest-protocols/sdk";
import { AbstractProvider } from "@/abstract/AbstractProvider";
import { Resource, ResourceDetails } from "@/types";
import { z } from "zod";
import { Address } from "viem";

/**
 * The details will be stored for each created Resource.
 * @responsible Protocol Owner
 */
export type ExampleResourceDetails = ResourceDetails & {
  Example_Detail: number;

  /* This field won't be sent when the User requested it */
  _examplePrivateDetailWontSentToUser: string;
};

/**
 * Base Provider that defines what kind of actions needs to be implemented for the Protocol.
 * @responsible Protocol Owner
 */
export abstract class BaseExampleServiceProvider extends AbstractProvider<ExampleResourceDetails> {
  /**
   * An example function that represents service specific action. This
   * function has to be implemented by all of the Providers who wants to.
   * participate to this Protocol.
   *
   * The definition is up to Protocol Owner. So if some of the
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
     * If your service has some functionalities/interactions (like "doSomething" method)
     * you can define "Pipe" routes to map the incoming requests from end users to the
     * corresponding methods.
     *
     * Pipe is a simple abstraction layer that allow the participants to communicate
     * HTTP like request-response style communication between them.
     *
     * Take a look at the example below:
     */

    /** Calls "doSomething" method. */
    this.route(PipeMethod.GET, "/do-something", async (req) => {
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

          /** Protocol address that the resource created in. */
          pt: addressSchema, // A pre-defined Zod schema for smart contract addresses.

          /** Additional argument for the method. */
          argument: z.string(),
        })
      );

      /**
       * Retrieve the resource from the database.
       *
       * IMPORTANT NOTE:
       * We need to authorize the user (to be sure that he is the actual owner
       * of the resource) before processing the request. To do this, we can
       * use `this.getResource`. This method tries to find the resource data
       * in the database based on the requester and throws proper errors if it cannot.
       * If the requester is not the owner of the resource, it won't be found.
       *
       * So even you don't need to use resource data, you need to call `this.getResource`
       * to be sure that user is actual owner of the resource.
       */
      const { agreement, resource } = await this.getResource(
        body.id,
        body.pt as Address,
        req.requester
      );

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
