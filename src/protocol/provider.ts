import { Agreement, PipeResponseCode } from "@forest-protocols/sdk";
import {
  BaseMachineTranslationServiceProvider,
  MachineTranslationDetails,
  TranslationResult,
} from "./base-provider";
import { DetailedOffer, Resource } from "@/types";

/**
 * The main class that implements provider specific actions.
 * @responsible Provider
 */
export class MachineTranslationServiceProvider extends BaseMachineTranslationServiceProvider {
  async checkCallLimit(
    agreement: Agreement,
    resource: Resource,
    offer: DetailedOffer
  ): Promise<boolean> {
    /**
     * TODO: Implement how to check if the user has exceeded the call limit or not.
     * A simple implementation is below:
     */
    const details: MachineTranslationDetails = resource.details;

    if (typeof offer.details == "object") {
      const param = offer.details.params["API Call Limit"];

      // If the param that we are looking for is defined and it is a numerical value
      if (param && !Array.isArray(param) && typeof param === "object") {
        return details.API_Call_Count < param.value;
      }
    }

    // If the API call limit is not defined in the Offer details, simply use a default one.
    return details.API_Call_Count < 1000;
  }

  async create(
    agreement: Agreement,
    offer: DetailedOffer
  ): Promise<MachineTranslationDetails> {
    /**
     * TODO: Implement how the resource will be created.
     */
    // If there is no additional action need for creation, you can
    // just leave this method as empty and return mandatory details:
    /*  return {
      status: DeploymentStatus.Running,
      _examplePrivateDetailWontSentToUser: "string data",
      Example_Detail: 42,
    }; */

    throw new Error("Method not implemented.");
  }

  async getDetails(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<MachineTranslationDetails> {
    /**
     * TODO: Implement how the details retrieved from the resource source.
     */
    // If there is no details, you can just return the existing ones;
    /* return {
      ...resource.details,
      status: resource.deploymentStatus,
    }; */
    throw new Error("Method not implemented.");
  }

  async delete(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<void> {
    /**
     * TODO: Implement how the resource will be deleted.
     */
    throw new Error("Method not implemented.");
  }

  async languages(offer: DetailedOffer): Promise<string[]> {
    /**
     * TODO: Implement the languages logic here.
     * This method should return the list of languages supported by the provider.
     */
    throw new Error("Method not implemented.");
  }

  async translate(body: {
    from?: string;
    to: string;
    text: string;
  }): Promise<TranslationResult> {
    /**
     * TODO: Implement the translation logic here.
     */
    throw new Error("Method not implemented.");
  }

  async detect(text: string): Promise<string> {
    /**
     * TODO: Implement the detect logic here.
     * This method should return the detected language of the given text.
     */
    throw new Error("Method not implemented.");
  }
}
