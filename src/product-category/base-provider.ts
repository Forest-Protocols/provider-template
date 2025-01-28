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

export type SupportedLanguages = {
  translation: {
    [key: string]: {
      name: string;
      nativeName: string;
      dir: string;
    };
  };
};
export type MachineTranslationDetails = ResourceDetails & {};

/**
 * Base provider that defines what kind of actions needs to be implemented for the product category.
 * @responsible Product Category Owner
 */
export abstract class BaseMachineTranslationProvider extends AbstractProvider<MachineTranslationDetails> {

  /**
   * Returns the list of languages supported by the provider.
   */
  abstract languages(): Promise<SupportedLanguages[]>;

  /**
   * Translates the text from the source language to the target language.
   * @param options Options for the translation
   * @param agreement Agreement details
   * @param resource Resource details
   * @returns The translated text
   */

  abstract translate(options: {
    source?: string;
    target: string;
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
    this.pipe!.route(PipeMethod.GET, "/languages", async (req) => {
      if (req.params?.api_version) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "Invalid API version or missing API version in the request",
        });
      }
      //check the resource
      //Ask Muhamed if we should use a client to call the languages method, because it seems that this route should be called by the client and get the languages from the provider
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
      if (!req.requester) {
        throw new PipeError(PipeResponseCode.NOT_AUTHORIZED, {
          message: "Unauthorized",
        });
      }

      if (!req.body?.target || !req.body?.text) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "Missing required parameters",
        });
      }

      //Again the same question should we call here an axios instance that communicate with e.g. client and get the translation from the provider
      return {
        code: PipeResponseCode.OK,
        body: {
          translation: await this.translate({
            source: req.body.source,
            target: req.body.target,
          }),
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
      if (!req.requester) {
        throw new PipeError(PipeResponseCode.NOT_AUTHORIZED, {
          message: "Unauthorized",
        });
      }

      if (!req.body?.text) {
        throw new PipeError(PipeResponseCode.BAD_REQUEST, {
          message: "Missing required parameters",
        });
      }

      // Return the response with the results.
      return {
        code: PipeResponseCode.OK,
        body: {
          detected: await this.detect(req.body.text),
        },
      };
    });
  }
}
