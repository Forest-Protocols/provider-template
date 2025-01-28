import { Agreement } from "@forest-protocols/sdk";
import {
  BaseMachineTranslationProvider,
  MachineTranslationDetails,
} from "./base-provider";
import { Resource, OfferDetails } from "@/types";

/**
 * The main class that implements provider specific actions.
 * @responsible Provider
 */
export class MachineTranslationProvider extends BaseMachineTranslationProvider {
  async create(
    agreement: Agreement,
    offer: OfferDetails,
  ): Promise<MachineTranslationDetails> {
    /**
     * TODO: Implement how the resource will be created.
     */
    // If there is no additional action need for the deletion, you can
    // just leave this method as empty.
    throw new Error("Method not implemented.");
  }

  async getDetails(
    agreement: Agreement,
    resource: Resource,
  ): Promise<MachineTranslationDetails> {
    /**
     * TODO: Implement how the details retrieved from the resource source.
     */

    // If there is no details, you can just return the existing details;
    // return resource.details;
    throw new Error("Method not implemented.");
  }

  async delete(
    agreement: Agreement,
    resource: Resource,
  ): Promise<MachineTranslationDetails> {
    /**
     * TODO: Implement how the resource will be deleted.
     */

    // If there is no additional action need for the deletion, you can
    // just leave this method as empty.
    throw new Error("Method not implemented.");
  }

  async languages(): Promise<any> {
    /**
     * TODO: Implement the languages logic here.
     * This method should return the list of languages supported by the provider.
     */
    throw new Error("Method not implemented.");
  }

  async translate(options: { source?: string; target: string }): Promise<any> {
    /**
     * TODO: Implement the translation logic here.
     */
    throw new Error("Method not implemented.");
  }

  async detect(text: string): Promise<any> {
    /**
     * TODO: Implement the detect logic here.
     * This method should return the detected language of the text.
     */
    throw new Error("Method not implemented.");
  }
}
