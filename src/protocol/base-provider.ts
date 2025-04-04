import {
  addressSchema,
  Agreement,
  PipeError,
  PipeMethod,
  PipeResponseCode,
  Protocol,
} from "@forest-protocols/sdk";
import { AbstractProvider } from "@/abstract/AbstractProvider";
import { DetailedOffer, Resource, ResourceDetails } from "@/types";
import { DB } from "@/database/Database";

import { Address } from "viem";
import { z } from "zod";
import { validateBody } from "@/helpers";
import { tryParseJSON } from "@/utils";
import { rpcClient } from "@/clients";
import { config } from "@/config";

/**
 * The details will be stored for each created Resource.
 * @responsible Protocol Owner
 */
export type MachineTranslationDetails = ResourceDetails & {
  API_Call_Count: number;
};

/**
 * Result of a translation request
 */
export type TranslationResult = {
  from: string;
  to: string;
  translation: string;
};

/**
 * Base Provider that defines what kind of actions needs to be implemented for the Protocol.
 * @responsible Protocol Owner
 */
export abstract class BaseMachineTranslationServiceProvider extends AbstractProvider<MachineTranslationDetails> {
  /**
   * Checks if the Resource still have API call limit.
   * @param agreement On-chain agreement data.
   * @param resource Resource information stored in the database.
   * @param offer Offer details to know total API call limit.
   */
  abstract checkCallLimit(
    agreement: Agreement,
    resource: Resource,
    offer: DetailedOffer
  ): Promise<boolean>;

  /**
   * Returns the list of languages supported by the Provider for a specific Offer
   * It can be used via `GET /languages`
   * @returns List of supported language codes in ISO 639 format
   */
  abstract languages(offer: DetailedOffer): Promise<string[]>;

  /**
   * Translates the given text to the target language.
   * It can be used via `POST /translate`
   * @returns The translated string
   */
  abstract translate(body: {
    /**
     * ISO 639 code of the source language. Automatically detected if it is not given.
     * Throws error if the Provider doesn't support auto detection.
     */
    from?: string;

    /**
     * ISO 639 code of the target language
     */
    to: string;

    /**
     * The text that is going to be translated
     */
    text: string;
  }): Promise<TranslationResult>;

  /**
   * Detects the language of the text.
   * It can be used via `POST /detect`
   * @param text The text that needs to be detected
   * @returns The detected language
   **/
  abstract detect(text: string): Promise<string>;

  async init(providerTag: string) {
    await super.init(providerTag);

    const protocolClient = (address: Address) =>
      new Protocol({
        address: address,
        client: rpcClient,
        registryContractAddress: config.REGISTRY_ADDRESS,
      });

    this.route(PipeMethod.POST, "/translate", async (req) => {
      const bodySchema = z.object({
        /**
         * Resource/Agreement ID
         */
        id: z.number(),

        /**
         * The source language. Automatically detected if it is not given.
         * Throws error if the Provider doesn't support auto detection.
         */
        from: z.string().optional(),

        /**
         * Target language
         */
        to: z.string(),

        /**
         * Text to be translated
         */
        text: z.string(),

        /**
         * Protocol address
         */
        pt: addressSchema,
      });

      const body = validateBody(req.body, bodySchema);

      const { resource, agreement } = await this.getResource(
        body.id,
        body.pt as Address,
        req.requester
      );

      const offer = await protocolClient(body.pt as Address).getOffer(
        agreement.offerId
      );
      const [offerDetails] = await DB.getDetailFiles([offer.detailsLink]);

      const isAllowed = await this.checkCallLimit(agreement, resource, {
        ...offer,

        // Try to parse Offer details if it is defined in a structured way. Otherwise `details` will be undefined
        details: tryParseJSON(offerDetails.content),
      });

      if (!isAllowed) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "API call limit exceeded",
        });
      }

      // Translate the text
      const result = await this.translate({
        from: body.from,
        to: body.to,
        text: body.text,
      });

      // Account the call count by saving it to the database
      await DB.updateResource(resource.id, resource.ptAddress, {
        details: {
          ...resource.details,
          API_Call_Count: resource.details.API_Call_Count + 1,
        },
      });

      return {
        code: PipeResponseCode.OK,
        body: result,
      };
    });

    this.route(PipeMethod.POST, "/detect", async (req) => {
      const bodySchema = z.object({
        /**
         * Resource/Agreement ID
         */
        id: z.number(),

        /**
         * The text that is going to be detected
         */
        text: z.string(),

        /**
         * Protocol address
         */
        pt: addressSchema,
      });
      const body = validateBody(req.body, bodySchema);
      const { resource, agreement } = await this.getResource(
        body.id,
        body.pt as Address,
        req.requester
      );

      const offer = await protocolClient(body.pt as Address).getOffer(
        agreement.offerId
      );
      const [offerDetails] = await DB.getDetailFiles([offer.detailsLink]);

      const isAllowed = await this.checkCallLimit(agreement, resource, {
        ...offer,

        // Try to parse Offer details if it is defined in a structured way. Otherwise `details` will be undefined
        details: tryParseJSON(offerDetails.content),
      });

      if (!isAllowed) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "API call limit exceeded",
        });
      }

      // Detect the language of the text
      const result = await this.detect(body.text);

      // Account the call count by saving it to the database
      await DB.updateResource(resource.id, resource.ptAddress, {
        details: {
          ...resource.details,
          API_Call_Count: resource.details.API_Call_Count + 1,
        },
      });

      // Return the response with the results.
      return {
        code: PipeResponseCode.OK,
        body: result,
      };
    });

    this.route(PipeMethod.GET, "/languages", async (req) => {
      const bodySchema = z.object({
        /**
         * Offer ID
         */
        offerId: z.number(),

        /**
         * Protocol address
         */
        pt: addressSchema,
      });

      const body = validateBody(req.body, bodySchema);

      const offer = await protocolClient(body.pt as Address).getOffer(
        body.offerId
      );
      const [offerDetails] = await DB.getDetailFiles([offer.detailsLink]);

      const languages = await this.languages({
        ...offer,
        details: tryParseJSON(offerDetails),
      });

      return {
        code: PipeResponseCode.OK,
        body: languages,
      };
    });
  }
}
