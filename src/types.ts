import {
  DeploymentStatus,
  OfferDetails,
  PipeRequest,
  PipeRouteHandlerResponse,
} from "@forest-protocols/sdk";
import { Address } from "viem";

/**
 * The base details that should be gathered by
 * the provider from the actual resource source.
 */
export type ResourceDetails = {
  status: DeploymentStatus;

  /**
   * Name of the resource. If it is undefined,
   * a random name will be assigned to the resource. */
  name?: string;
  [key: string]: any;
};

/**
 * Resource details from the database.
 */
export type Resource = {
  id: number;
  name: string;
  deploymentStatus: DeploymentStatus;
  details: any;
  groupName: string;
  isActive: boolean;
  ownerAddress: Address;
  offer: {
    id: number;
    details: any;
    productCategory: Address;
    provider: {
      id: number;
      details: any;
      ownerAddress: Address;
    };
  };
};

/**
 * Offer related data stored in the database.
 */
export type DbOffer = {
  id: number;
  deploymentParams: any;
  details: OfferDetails;
  productCategory: Address;
};

export type ProviderPipeRouteHandler = (
  req: PipeRequest & { providerId: number }
) => Promise<PipeRouteHandlerResponse | void> | PipeRouteHandlerResponse | void;
