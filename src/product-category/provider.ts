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
  async translate(
    options: { from: string; to: string },
    agreement: Agreement,
    resource: Resource,
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async resetCredentials(
    agreement: Agreement,
    resource: Resource,
  ): Promise<any> {
    /**
     * TODO: Implement how the credentials would be reset.
     */
    throw new Error("Method not implemented.");
  }

  async sqlQuery(
    agreement: Agreement,
    resource: Resource,
    query: string,
  ): Promise<any[]> {
    /**
     * TODO: Implement the logic to achieve purpose of this function.
     */

    // An example;

    // Some important logic....

    return {
      numberResult: agreement.id,
      stringResult: `${resource.name}-${additionalArgument}`,
    };
  }

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
}
