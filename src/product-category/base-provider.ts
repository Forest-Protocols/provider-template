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
 * The details gathered by the Provider from the resource source.
 * This is the "details" type of each resource and it is stored in the database.
 * @responsible Product Category Owner
 */

export type MachineTranslationDetails = ResourceDetails & {
  API_Call_Count: number;
};

/**
 * Base Provider that defines what kind of actions needs to be implemented for the Product Category.
 * @responsible Product Category Owner
 */

export abstract class BaseMachineTranslationProvider extends AbstractProvider<MachineTranslationDetails> {
  /**
   * Checks if the resource still has limit to call query API.
   * @param resource Resource record of the agreement.
   * @param offer The offer details that the resource is in use.
   */
  abstract checkCallLimit(
    agreement: Agreement,
    resource: Resource,
    offer: DetailedOffer,
  ): Promise<boolean>;

  /**
   * Returns the list of languages supported by the provider.
   */
  abstract languages(): Promise<any>;

  /**
   * Translates the text from the source language to the target language.
   * @param body for the translation
   * @param agreement Agreement details
   * @param resource Resource details
   * @returns The translated text
   */

  abstract translate(body: {
    from?: string;
    to?: string;
    key?: string;
    text: string;
    version?: string;
  }): Promise<any>;
  /**
   * Detects the language of the text.
   * @param text The text that needs to be detected
   * @param agreement Agreement details
   * @param resource Resource details
   * @returns The detected language
   **/
  abstract detect(text: string): Promise<any>;

  async init(providerTag: string) {
    // Base class' `init` function must be called.
    await super.init(providerTag);

    /**
     method: GET,
     path: /languages,
     */

    this.route(PipeMethod.GET, "/languages", async (req) => {
      /**
       * Validates the params/body of the request. If they are not valid
       * request will reply back to the user with a validation error message
       * and bad request code automatically.
       */

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

      const body = validateBodyOrParams(
        req.body,
        z.object({
          /** ID of the resource. */
          id: z.number(),

          /** Product Category address that the resource created in. */
          pc: addressSchema, // A pre-defined Zod schema for smart contract addresses.
        }),
      );

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

        details: tryParseJSON(offerDetails),
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

    /**
     * method: POST
     * path: /translate
     * body: {
     * source (optional) : string -> The source language
     * target (required) : string -> The target language
     * text (required) : string -> The text that is going to be translated
     * }
     */

    this.route(PipeMethod.POST, "/translate", async (req) => {
      console.log(req);
      const bodySchema = z.object({
        id: z.number(),
        text: z.string(),
        from: z.string().optional(),
        to: z.string(),
        version: z.string().optional(),
        key: z.string().optional(),
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

        details: tryParseJSON(offerDetails),
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
        version: body.version,
        from: body.from,
        to: body.to,
        text: body.text,
        key: body.key,
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
     * body: {
     * text (required) : string -> The text that is going to be detected
     * }
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

        details: tryParseJSON(offerDetails),
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
