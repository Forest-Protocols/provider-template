import { Agreement } from "@forest-protocols/sdk";
import {
  BaseMachineTranslationProvider,
  MachineTranslationDetails,
} from "./base-provider";
import { DetailedOffer, Resource } from "@/types";

/**
 * The main class that implements provider specific actions.
 * @responsible Provider
 */
export class MachineTranslationProvider extends BaseMachineTranslationProvider {

  async checkCallLimit(
    agreement: Agreement,
    resource: Resource,
    offer: DetailedOffer,
  ): Promise<boolean> {
    /**
     * TODO: Implement how to check if the user has exceeded the call limit or not.
     * A simple implementation is below:
     */
    const details: MachineTranslationDetails = resource.details;

    if (typeof offer.details == "object") {
      const param = offer.details.params["API Call Limit"];

      // If the param that we are looking for defined as a numerical value
      if (!Array.isArray(param) && typeof param === "object") {
        return details.API_Call_Count < param.value;
      }
    }

    // If in the Offer details, there is no defined call limit, just use the default one.
    return details.API_Call_Count < 1000;
  }

  async create(
    agreement: Agreement,
    offer: DetailedOffer,
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
    resource: Resource,
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
    resource: Resource,
  ): Promise<void> {
    /**
     * TODO: Implement how the resource will be deleted.
     */
    throw new Error("Method not implemented.");
  }

  async languages(): Promise<any> {
    /**
     * TODO: Implement the languages logic here.
     * This method should return the list of languages supported by the provider.
     */
    throw new Error("Method not implemented.");
  }

  async translate(body: {
    from?: string;
    to?: string;
    key?: string;
    text?: string;
    version?: string;
  }): Promise<any> {
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
