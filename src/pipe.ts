import {
  HTTPPipe,
  MaybePromise,
  PipeError,
  PipeMethod,
  PipeMethodType,
  PipeRequest,
  PipeResponseCodes,
  PipeRouteHandler,
  PipeRouteHandlerResponse,
  validateBodyOrParams,
  XMTPv3Pipe,
} from "@forest-protocols/sdk";
import { AbstractProvider } from "./abstract/AbstractProvider";
import { logger } from "./logger";
import { colorHex, colorWord } from "./color";
import { z } from "zod";
import { Address } from "viem";
import { PipeErrorNotFound } from "./errors/pipe/PipeErrorNotFound";

/**
 * Pipe instances for each Operator that is configured
 */
export const pipes: Record<
  Address,
  {
    // TODO: XMTP Pipe will be removed in the future
    xmtp: XMTPv3Pipe;
    http: HTTPPipe;
  }
> = {};

/**
 * Provider specific routes.
 * TODO: We don't need this route mapping. We can simply change the path and include the Provider ID e.g. `/providers/1/<path>` so setting of new routes won't override the other one. Ah, why I haven't thought of this before?! - mdk
 */
const providerRoutes: Record<
  // Key for fast accessing any route information.
  // It is the combination of "<method>-<provider id>-<path>"
  string,
  {
    providerId: number;
    method: PipeMethodType;
    path: `/${string}`;
    handler: ProviderPipeRouteHandler;
  }
> = {};

/**
 * Setups a Pipe route that is specialized for the given Provider. Only the requests
 * that include `providerId` field either in `body` or `params` will be processed by
 * the given handler.
 *
 * Route handlers are unique by their paths. Simply there is a relation
 * between Path + Method <-> Route handler. As an example let's think a situation like below:
 *
 * We have two different Providers which use the same Operator address and we have
 * a route configured as "GET /special-function" in the Protocol level. In that case
 * when we receive a request to this endpoint, how can we know which Provider should process this?
 * They are using the same Operator address but the implementation might be different. Since there
 * will be one Pipe (because two of the Providers are using the same Operator) the route
 * handler can be set only once. If it set twice, the second one will override the first one.
 *
 * So as a solution, the routes are defined with this function must include the
 * Provider ID and we store a mapping between Path + Method + Provider Id <-> Route handler
 * so we can know which Provider will process the request.
 *
 * `AbstractProvider.route()` method uses this function to define routes.
 */
export function pipeProviderRoute(
  provider: AbstractProvider,
  method: PipeMethodType,
  path: `/${string}`,
  handler: ProviderPipeRouteHandler
) {
  // Set the route handler for this Provider (if the given Provider ID matches)
  providerRoutes[`${method}-${provider.actor.id}-${path}`] = {
    handler,
    method,
    path,
    providerId: provider.actor.id,
  };

  // Also define the routes for the Virtual Providers (if there are any)
  defineProviderRoutesForVirtualProviders(provider);

  pipeOperatorRoute(provider.actor.operatorAddr, method, path, async (req) => {
    let providerId: number | undefined;

    // Lookup body and params for `providerId`
    const schema = z.object(
      { providerId: z.number().optional() },
      { message: "Empty object" }
    );

    if (req.body !== undefined) {
      const body = validateBodyOrParams(req.body, schema);
      providerId = body.providerId;
    }

    // If the ID is not found in the body, then lookup to the params
    if (providerId === undefined && req.params !== undefined) {
      const params = validateBodyOrParams(req.params, schema);
      providerId = params.providerId;
    }

    if (providerId === undefined) {
      throw new PipeError(PipeResponseCodes.BAD_REQUEST, {
        message: `"providerId" must be included either in "body" or "params"`,
      });
    }

    // Search the corresponding handler for the given Provider ID, path and method
    const route = providerRoutes[`${method}-${providerId}-${path}`];

    // Throw error if there is no handler defined in this pipe for the given provider
    if (!route) {
      throw new PipeErrorNotFound(`${method} ${req.path}`);
    }

    // Run the handler of the route.
    return await route.handler({
      ...req,
      providerId: providerId!,
    });
  });
}

/**
 * Defines the same handler functions of all the routes
 * for the Virtual Providers of the given Provider.
 */
export function defineProviderRoutesForVirtualProviders(
  provider: AbstractProvider
) {
  // The given Provider doesn't have any vPROVs so no need to do anything.
  if (provider.virtualProviders.length === 0) {
    return;
  }

  // Find the routes that are belong to the given Provider
  const routes = Object.entries(providerRoutes)
    .filter(([, info]) => info.providerId === provider.actor.id)
    .map(([, route]) => route);

  // Define same handlers for the Virtual Providers
  for (const vprov of provider.virtualProviders) {
    for (const route of routes) {
      // Handler will remain the same but the key will be different.
      // This one points to the Virtual Provider.
      const key = `${route.method}-${vprov.actor.id}-${route.path}`;
      providerRoutes[key] = {
        ...route, // Take the info from the original one
        providerId: vprov.actor.id, // TODO: This might be unnecessary
      };
    }
  }
}

/**
 * Setups a Pipe route in the given Operator's Pipe.
 */
export function pipeOperatorRoute(
  operatorAddress: Address,
  method: PipeMethodType,
  path: string,
  handler: PipeRouteHandler,
  pipe?: "xmtp" | "http"
) {
  if (!pipes[operatorAddress]) {
    throw new Error(`There is no initialized Pipe for ${operatorAddress}`);
  }

  const handlerWrapper = async (req: PipeRequest) => {
    logger.info(
      `Got Pipe request with id ${colorWord(req.id)} from ${colorHex(
        req.requester
      )} on ${method} ${path}`
    );
    try {
      const result = await handler(req);
      logger.info(
        `Pipe request with id ${colorWord(req.id)} from ${colorHex(
          req.requester
        )} on ${method} ${path} was successful`
      );
      return result;
    } catch (error) {
      logger.error(
        `Pipe request with id ${colorWord(req.id)} from ${colorHex(
          req.requester
        )} on ${method} ${path} failed: ${error}`
      );
      throw error;
    }
  };

  if (pipe === undefined || pipe === "xmtp") {
    pipes[operatorAddress].xmtp.route(
      method as PipeMethod,
      path,
      handlerWrapper
    );
  }

  if (pipe === undefined || pipe === "http") {
    pipes[operatorAddress].http.route(method, path, handlerWrapper);
  }
}

/**
 * The route handler type that includes `providerId` as an
 * additional field in the request. That additional field
 * is filled up when `pipeProviderRoute` function is used
 * to define route handler.
 */
export type ProviderPipeRouteHandler = (
  req: PipeRequest & { providerId: number }
) => MaybePromise<PipeRouteHandlerResponse>;
