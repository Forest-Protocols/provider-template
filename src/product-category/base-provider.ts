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

    this.route(PipeMethod.GET, "/languages", async (req) => {
      const body = validateBodyOrParams(
        req.body,
        z.object({
          id: z.number(),
          pc: addressSchema,
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
