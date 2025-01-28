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

import { Address } from "viem";
import { DetectResponse, SupportedLanguages, TranslateResponse } from "./types";
import { Hex } from "viem";
import { z } from "zod";
import { validateBody } from "@/helpers";

/**
 * The details gathered by the provider from the resource source.
 * This is the "details" type of each resource and it is stored in the database.
 * @responsible Product Category Owner
 */

export type MachineTranslationDetails = ResourceDetails & {
  customerAddr: Hex;
  type: string;
};

/**
 * Base provider that defines what kind of actions needs to be implemented for the product category.
 * @responsible Product Category Owner
 */

export abstract class BaseMachineTranslationProvider extends AbstractProvider<MachineTranslationDetails> {
  /**
   * Returns the list of languages supported by the provider.
   */
  abstract languages(): SupportedLanguages;

  /**
   * Translates the text from the source language to the target language.
   * @param options Options for the translation
   * @param agreement Agreement details
   * @param resource Resource details
   * @returns The translated text
   */

  abstract translate(
    options: {
      source?: string;
      target: string;
    },
    text: string,
  ): TranslateResponse;
  /**
   * Detects the language of the text.
   * @param text The text that needs to be detected
   * @param agreement Agreement details
   * @param resource Resource details
   * @returns The detected language
   **/
  abstract detect(text: string): DetectResponse;

  async init(providerTag: string) {
    // Base class' `init` function must be called.
    await super.init(providerTag);

    /**
     method: GET,
     path: /languages,
     */

    this.pipe!.route(PipeMethod.GET, "/languages", async (_req) => {
      return {
        code: PipeResponseCode.OK,
        body: {
          languages: await this.languages(),
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

    this.pipe!.route(PipeMethod.POST, "/translate", async (req) => {
      const schema = z.object({
        id: z.number(),
        source: z.string().optional(),
        target: z.string(),
        text: z.string(),
      });

      const body = validateBody(req.body, schema);

      const agreementId = body.id;

      const resource = await DB.getResource(
        agreementId,
        req.requester,
      );

      if (!resource || !resource?.isActive) {
        throw new PipeErrorNotFound("Resource");
      }

      const result = await this.translate(
        {
          source: body.source,
          target: body.target,
        },
        body.text,
      );

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
    this.pipe!.route(PipeMethod.POST, "/detect", async (req) => {
      if (!req.body?.text) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "Missing required parameters",
        });
      }

      const result = await this.detect(req.body.text);

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
