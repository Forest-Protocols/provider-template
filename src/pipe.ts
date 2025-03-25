import {
  PipeError,
  PipeMethod,
  PipeResponseCode,
  PipeRouteHandler,
  validateBodyOrParams,
  XMTPv3Pipe,
} from "@forest-protocols/sdk";
import { AbstractProvider } from "./abstract/AbstractProvider";
import { z } from "zod";
import { ProviderPipeRouteHandler } from "./types";
import { logger } from "./logger";

/**
 * Operator pipes in this daemon
 */
export const pipes: {
  [operatorAddr: string]: XMTPv3Pipe;
} = {};

/**
 * Routes defined by providers
 */
export const providerRoutes: {
  [providerId: string]: {
    [path: string]: {
      [method: string]: ProviderPipeRouteHandler;
    };
  };
} = {};

/**
 * Setups a pipe route in the operator Pipe for the given provider.
 * Uses either `body.providerId` or `params.providerId` from the request to find correct handler function.
 */
export function providerPipeRoute(
  provider: AbstractProvider,
  method: PipeMethod,
  path: `/${string}`,
  handler: ProviderPipeRouteHandler
) {
  if (!providerRoutes[provider.actorInfo.id]) {
    providerRoutes[provider.actorInfo.id] = {};
  }

  if (!providerRoutes[provider.actorInfo.id][path]) {
    providerRoutes[provider.actorInfo.id][path] = {};
  }

  providerRoutes[provider.actorInfo.id][path][method] = handler;

  pipeOperatorRoute(
    provider.actorInfo.operatorAddr,
    method,
    path,
    async (req) => {
      let providerId: number | undefined;

      // Lookup body and params for `providerId`
      const schema = z.object({
        providerId: z.number().optional(),
      });

      if (req.body !== undefined) {
        const body = validateBodyOrParams(req.body, schema);
        providerId = body.providerId;
      } else if (req.params !== undefined) {
        const params = validateBodyOrParams(req.params, schema);
        providerId = params.providerId;
      }

      if (providerId === undefined) {
        throw new PipeError(PipeResponseCode.NOT_FOUND, {
          message: `Missing "providerId"`,
        });
      }

      // Search the corresponding handler for the given provider, path and method
      const providerRouteHandler =
        providerRoutes[providerId!]?.[path]?.[method];

      // Throw error if there is no handler defined in this pipe for the given provider
      if (!providerRouteHandler) {
        throw new PipeError(PipeResponseCode.NOT_FOUND, {
          message: `${method} ${req.path} not found`,
        });
      }

      return await providerRouteHandler({
        ...req,
        providerId: providerId!,
      });
    }
  );
}

/**
 * Setups a new route handler for the given operator.
 */
export function pipeOperatorRoute(
  operatorAddress: string,
  method: PipeMethod,
  path: string,
  handler: PipeRouteHandler
) {
  if (!pipes[operatorAddress]) {
    throw new Error(`There is no pipe for ${operatorAddress}`);
  }

  pipes[operatorAddress].route(method, path, async (req) => {
    logger.info(`Got Pipe request with id ${req.id} on ${method} ${path}`);
    return await handler(req);
  });
}
