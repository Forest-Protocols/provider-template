import { Agreement, DeploymentStatus } from "@forest-protocols/sdk";
import {
  BaseExampleServiceProvider,
  ExampleResourceDetails,
} from "./base-provider";
import { DetailedOffer, Resource } from "@/types";
import { z } from "zod";
import { VirtualProviderConfigurationInformation } from "@/abstract/AbstractProvider";

/**
 * Gateway Provider (gPROV) is a Provider type that acts as a gateway for its
 * implementation with a set of configuration to the Virtual Providers (vPROV)
 * that are registered on it. You can find an example implementation of a gPROV right below.
 */
export class GatewayProviderImplementation extends BaseExampleServiceProvider {
  /**
   * Returns what kind of configuration can be applied by a vPROV. The returned
   * object will be used to show vPROVs to inform them about what configurations
   * are available and their meanings. So feel free to structure that object as you wish!
   * As long as it is meaningful and can be understood by the vPROVs, it is fine.
   */
  get availableVirtualProviderConfigurations(): Record<
    string,
    VirtualProviderConfigurationInformation
  > {
    return {
      size: {
        example: "10g or 512m",
        format: "<number>[g|m]",
        description: "Disk size of the Resource",
        required: true,
      },
      region: {
        example: "eu",
        format: ["eu", "as", "us"],
        description: "Region that the Resource will be provisioned in",
        default: "eu",
      },
    };
  }

  /**
   * Returns the Zod schema that will be used when vPROVs wants to configure their Offers.
   */
  get virtualProviderConfigurationSchema() {
    return z.object({
      region: z.enum(["eu", "as", "us"]).default("eu"),

      // `size` field has its own format so we are parsing it with `.transform` method.
      size: z.string().transform((value, ctx) => {
        const multiplier = value[value.length - 1].toLowerCase();
        const num = Number(value.slice(0, value.length - 1));

        if (isNaN(num)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid size number",
          });
          return z.NEVER;
        }

        if (!multiplier || !["g", "m"].includes(multiplier)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Invalid size multiplier. Must be "g" for gigabyte or "m" for megabyte',
          });
          return z.NEVER;
        }

        if (multiplier === "g") {
          return num * 1024 * 1024;
        } else {
          // Megabyte
          return num * 1024;
        }
      }),
    });
  }

  async doSomething(
    agreement: Agreement,
    resource: Resource,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    additionalArgument: string
  ): Promise<{ stringResult: string; numberResult: number }> {
    // This is the Protocol level method that all the Providers have to
    // implement. Since we are a gPROV, we need to implement it in a way
    // that supports vPROVs.

    // First find out which vPROV is responsible for this Resource
    const vprov = this.virtualProviders.findByResource(resource);

    // If we find it, we can simply continue to the implementation
    if (vprov) {
      // Find the meaning of the life...
      const result =
        0b101010 - (crypto.getRandomValues(new Uint8Array(1))[0] & 1);

      // You can also fetch the configuration that has been made for the Offer
      // that is being used by this Resource:
      const configuration = await this.getVirtualProviderConfiguration(
        agreement.offerId,
        this.protocol.address
      );

      return {
        numberResult: result * (configuration?.size ?? 0),
        stringResult: `According to ${resource.name} by Virtual Provider ${vprov.actor.ownerAddr}, the meaning of the life is ${result}`,
      };
    }

    // What if the Resource is not associated with one of the vPROVs?
    // In that case it's depend on the implementation. If you would like to
    // use gPROV as a regular Provider, you can implement here or simply you
    // can throw an error if you wouldn't like.
    //
    // NOTE: If you haven't registered any Offer for this gPROV, the workflow
    //       never reaches at this point because the vPROV will always be found.
    //       But it would be a good practice to add a throw statement to prevent
    //       untraceable behaviors.
    throw new Error(`The resource is controlled by a Virtual Provider`);
  }

  async create(
    agreement: Agreement,
    offer: DetailedOffer
  ): Promise<ExampleResourceDetails> {
    // Same example as `doSomething()` method.
    // Find the vPROV and use it on the creation phase.
    const vprov = this.virtualProviders.findByOffer(offer);

    if (vprov) {
      const configuration = await this.getVirtualProviderConfiguration(
        agreement.offerId,
        this.protocol.address
      );

      return {
        status: DeploymentStatus.Running,
        _examplePrivateDetailWontSentToUser: `Resource created by a Virtual Provider ${
          vprov.actor.ownerAddr
        } with the following configuration: ${JSON.stringify(configuration)}`,
        Example_Detail: 42,
      };
    }

    // The Offer is not owned by a vPROV and as a gPROV, we are not supporting
    // creating Resources by our owns (we only act as a "Gateway" for vPROVs)
    throw new Error(`The Offer is not belong to any of the Virtual Providers`);
  }

  async getDetails(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<ExampleResourceDetails> {
    return {
      ...resource.details,
      status: resource.deploymentStatus,
    };
  }

  async delete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    agreement: Agreement,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    offer: DetailedOffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resource: Resource
  ): Promise<void> {}
}
