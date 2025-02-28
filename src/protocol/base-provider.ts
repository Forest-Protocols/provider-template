import {
  addressSchema,
  Agreement,
  PipeError,
  PipeMethod,
  PipeResponseCode,
  validateBodyOrParams,
} from "@forest-protocols/sdk";
import { AbstractProvider } from "@/abstract/AbstractProvider";
import { DetailedOffer, Resource, ResourceDetails } from "@/types";
import { DB } from "@/database/Database";

import { Address } from "viem";
import { z } from "zod";
import { validateBody } from "@/helpers";
import { tryParseJSON } from "@/utils";

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
  abstract checkCallLimit(
    agreement: Agreement,
    resource: Resource,
    offer: DetailedOffer,
  ): Promise<boolean>;
  /**
   * Returns the list of languages supported by the provider.
   */
  abstract languages(): Promise<[]>;

  /**
   * method: POST
   * path: /translate
   * from (optional) : string -> The source language
   * to (required) : string -> The target language
   * text (required) : string -> The text that is going to be translated
   * @return code and response
   */

  abstract translate(body: {
    from?: string;
    to: string;
    text: string;
  }): Promise<{
    code: PipeResponseCode;
    response: { id: number; text: string; from?: string; to: string };
  }>;

  /**
   * Detects the language of the text.
   * @param text The text that needs to be detected
   * @returns The detected language
   **/
  abstract detect(text: string): Promise<unknown>;

  async init(providerTag: string) {
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
          id: z.number(),

          /** Protocol address that the resource created in. */
          pt: addressSchema, // A pre-defined Zod schema for smart contract addresses.

          /** Additional argument for the method. */
          argument: z.string(),
        })
      );

      const { resource, agreement } = await this.getResource(
        body.id,
        body.pt as Address,
        req.requester
      );

      const offer = await this.getPcClient(body.pc as Address).getOffer(
        agreement.offerId,
      );

      const [offerDetails] = await DB.getDetailFiles([offer.detailsLink]);

      const isAllowed = await this.checkCallLimit(agreement, resource, {
        ...offer,

        details: tryParseJSON(offerDetails.content),
      });

      if (!isAllowed) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "API call limit exceed",
        });
      }

      await DB.updateResource(resource.id, resource.pcAddress, {
        details: {
          ...resource.details,
          API_Call_Count: resource.details.API_Call_Count + 1,
        },
      });

      const result = await this.languages();

      return {
        code: PipeResponseCode.OK,
        body: {
          languages: result,
        },
      };
    });

    this.route(PipeMethod.POST, "/translate", async (req) => {
      const bodySchema = z.object({
        id: z.number(),
        from: z.string().optional(),
        to: z.string(),
        text: z.string(),
        pc: addressSchema,
      });

      const body = validateBody(req.body, bodySchema);

      const { resource, agreement } = await this.getResource(
        body.id,
        body.pc as Address,
        req.requester,
      );

      const offer = await this.getPcClient(body.pc as Address).getOffer(
        agreement.offerId,
      );

      const [offerDetails] = await DB.getDetailFiles([offer.detailsLink]);

      const isAllowed = await this.checkCallLimit(agreement, resource, {
        ...offer,

        details: tryParseJSON(offerDetails.content),
      });

      if (!isAllowed) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "API call limit exceed",
        });
      }

      await DB.updateResource(resource.id, resource.pcAddress, {
        details: {
          ...resource.details,
          API_Call_Count: resource.details.API_Call_Count + 1,
        },
      });

      const result = await this.translate({
        from: body.from,
        to: body.to,
        text: body.text,
      });

      return {
        code: PipeResponseCode.OK,
        body: {
          result,
        },
      };
    });

    /**
     * method: POST
     * path: /detect
     * text (required) : string -> The text that is going to be detected
     * @return code and response
     */
    this.route(PipeMethod.POST, "/detect", async (req) => {
      const bodySchema = z.object({
        id: z.number(),
        text: z.string(),
        pc: addressSchema,
      });
      const body = validateBody(req.body, bodySchema);
      const { resource, agreement } = await this.getResource(
        body.id,
        body.pc as Address,
        req.requester,
      );

      const offer = await this.getPcClient(body.pc as Address).getOffer(
        agreement.offerId,
      );

      const [offerDetails] = await DB.getDetailFiles([offer.detailsLink]);

      const isAllowed = await this.checkCallLimit(agreement, resource, {
        ...offer,

        details: tryParseJSON(offerDetails.content),
      });

      if (!isAllowed) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "API call limit exceed",
        });
      }

      await DB.updateResource(resource.id, resource.pcAddress, {
        details: {
          ...resource.details,
          API_Call_Count: resource.details.API_Call_Count + 1,
        },
      });
      const result = await this.detect(body.text);

      // Return the response with the results.
      return {
        code: PipeResponseCode.OK,
        body: {
          result,
        },
      };
    });
  }
}
