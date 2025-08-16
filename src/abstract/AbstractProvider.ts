import { rpcClient } from "@/clients";
import { colorHex } from "@/color";
import { config } from "@/config";
import { DB } from "@/database/client";
import { PipeErrorNotFound } from "@/errors/pipe/PipeErrorNotFound";
import { PipeErrorUnauthorized } from "@/errors/pipe/PipeErrorUnauthorized";
import { logger } from "@/logger";
import {
  pipeOperatorRoute,
  pipes,
  pipeProviderRoute,
  ProviderPipeRouteHandler,
  defineProviderRoutesForVirtualProviders,
} from "@/pipe";
import { cleanupHandlers } from "@/signal";
import { DetailedOffer, Resource, ResourceDetails } from "@/types";
import { ensureError } from "@/utils/ensure-error";
import { ProviderConfig } from "@/validation/provider";
import {
  PipeRouteHandler,
  Provider,
  ProviderDetails,
  validateBodyOrParams,
  XMTPv3Pipe,
  Agreement,
  Protocol,
  Registry,
  tryParseJSON,
  ProviderDetailsSchema,
  HTTPPipe,
  AddressSchema,
  PipeResponseCodes,
  PipeMethods,
  PipeMethodType,
  PipeRequest,
  PipeError,
  generateCID,
  Offer,
  Status,
} from "@forest-protocols/sdk";
import { yellow } from "ansis";
import { readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { Account, Address, nonceManager } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

/**
 * Base abstract class that Protocol Owners need to extend to define
 * the Protocol-wide actions for their Providers.
 */
export abstract class AbstractProvider<
  T extends ResourceDetails = ResourceDetails
> {
  logger = this.buildLogger();

  /**
   * Registry client
   */
  registry!: Registry;

  /**
   * Protocol client
   */
  protocol!: Protocol;

  /**
   * Details of the Provider (parsed from the details file)
   */
  details!: ProviderDetails;

  /**
   * Account to perform blockchain interactions
   */
  operatorAccount!: Account;

  /**
   * Provider tag (owner address for Virtual Providers)
   */
  tag!: string;

  /**
   * Registry information of the Provider that is
   * fetched from the blockchain.
   */
  actor!: Provider;

  /**
   * @deprecated Use `actor` instead
   */
  actorInfo!: Provider;

  /**
   * Configuration from the environment variables
   */
  configuration!: ProviderConfig;

  /**
   * Owner address that is parsed from the configuration
   */
  ownerAddress!: Address;

  /**
   * Virtual Providers that are registered in
   * this Gateway Provider (if this is a Gateway Provider)
   */
  private _virtualProviders = new VirtualProvidersArray();

  /**
   * Initializes the Provider.
   */
  async init(providerTag: string) {
    this.tag = providerTag;
    this.configuration = config.providerConfigurations[this.tag];

    if (!this.configuration) {
      throw new Error(
        `Provider config not found for ${this.logIdentifier()}. Please check your environment variables`
      );
    }

    // Setup operator account for blockchain interactions
    this.operatorAccount = privateKeyToAccount(
      this.configuration.OPERATOR_PRIVATE_KEY,
      { nonceManager } // TODO: Remove nonce manager and implement PromiseQueue for blockchain write TXs
    );

    // Convert private key to account to get owner address
    const ownerAccount = privateKeyToAccount(
      this.configuration.PROVIDER_PRIVATE_KEY
    );
    this.ownerAddress = ownerAccount.address;

    // Setup the logger
    this.logger = this.buildLogger();

    // Setup the Provider, clients, do checks etc.
    await this.setup();
  }

  /**
   * Registered Virtual Providers of this Gateway Provider
   */
  get virtualProviders() {
    // Return a copy of the array so mutations won't effect
    return new VirtualProvidersArray(...this._virtualProviders);
  }

  /**
   * Returns configuration given by the Virtual Provider for an Offer
   */
  async getVirtualProviderConfiguration(
    offerId: number,
    protocolAddress: Address
  ): Promise<z.infer<this["virtualProviderConfigurationSchema"]> | undefined> {
    return await DB.getVirtualProviderConfiguration(offerId, protocolAddress);
  }

  /**
   * Initializes the Registry client.
   */
  private setupRegistryClient() {
    this.registry = new Registry({
      client: rpcClient,
      account: this.operatorAccount, // Use operator account for all write transactions
      address: config.REGISTRY_ADDRESS,
    });
  }

  /**
   * Route handler for the `/spec` endpoint.
   */
  private async routeHandlerSpec() {
    try {
      const possibleSpecFiles = [
        "spec.yaml",
        "spec.json",
        "oas.json",
        "oas.yaml",
      ];

      // Search for any of the possible spec files
      for (const specFile of possibleSpecFiles) {
        const path = join(process.cwd(), "data", specFile);
        const stat = statSync(path, { throwIfNoEntry: false });

        if (stat && stat.isFile()) {
          const content = readFileSync(path, {
            encoding: "utf-8",
          }).toString();

          // If found one, return its content
          return {
            code: PipeResponseCodes.OK,
            body: content,
          };
        }
      }
    } catch (err) {
      const error = ensureError(err);
      this.logger.error(`Couldn't load OpenAPI spec file: ${error.message}`);
    }

    throw new PipeErrorNotFound(`OpenAPI spec file`);
  }

  /**
   * Route handler for the `/details` endpoint.
   */
  private async routeHandlerDetails(req: PipeRequest) {
    // If there is a query param, use it. Otherwise, use the body.
    let source: any[] = req.body;

    if (req.params?.cids?.length > 0) {
      source = req.params!.cids;
    }

    const cids = validateBodyOrParams(source, z.array(z.string()).min(1));
    const files = await DB.getDetailFiles(cids);

    if (files.length == 0) {
      throw new PipeErrorNotFound("Detail files");
    }

    return {
      code: PipeResponseCodes.OK,
      body: files.map((file) => file.content),
    };
  }

  /**
   * Route handler for `/resources` endpoint
   */
  private async routeHandlerResources(req: PipeRequest) {
    const params = validateBodyOrParams(
      req.body || req.params,
      z.object({
        /** ID of the resource. */
        id: z.coerce.number().optional(),

        /** Protocol address that the resource created in. */
        pt: AddressSchema.optional(), // A pre-defined Zod schema for smart contract addresses.
      })
    );

    // If not both of them are given, send all resources of the requester
    if (params.id === undefined || params.pt === undefined) {
      return {
        code: PipeResponseCodes.OK,
        body: await DB.getAllResourcesOfUser(req.requester as Address),
      };
    }

    // Since the Pipe implementations have wallet address verification, we don't need to worry about
    // if this request really sent by the owner of the resource. In case of the sender is
    // different from the owner of the resource, the resource won't be able to found in the Provider's
    // database because resources are stored in the database as:
    //  resource id <-> owner address <-> protocol address
    // pairs. `.getResource` handles all these checks.
    const resource = await DB.getResource(
      params.id,
      req.requester,
      params.pt as Address
    );

    if (!resource) {
      throw new PipeErrorNotFound(`Resource ${params.id}`);
    }

    // Filter fields that starts with underscore.
    const details: any = {};
    for (const [name, value] of Object.entries(resource.details)) {
      if (name.startsWith("_")) {
        continue;
      }

      details[name] = value;
    }

    resource.details = details; // Use filtered details

    return {
      code: PipeResponseCodes.OK,
      body: resource,
    };
  }

  /**
   * Initializes XMTP and HTTP Pipes for the Operator.
   */
  private async initPipes() {
    // Setup the Pipes if they are not initialized yet for this Operator
    if (!pipes[this.actor.operatorAddr]) {
      pipes[this.actor.operatorAddr] = {
        // TODO: XMTP is deprecated. It will be removed in the future.
        xmtp: new XMTPv3Pipe(this.configuration.OPERATOR_PRIVATE_KEY, {
          dbPath: join(
            process.cwd(),
            "data",
            `db-${this.actor.operatorAddr}.db`
          ),

          // Doesn't matter what it is as long as it is something that
          // we can use in the next client initialization
          encryptionKey: this.actor.operatorAddr,
        }),
        http: new HTTPPipe(this.configuration.OPERATOR_PRIVATE_KEY, {
          port: this.configuration.OPERATOR_PIPE_PORT,
        }),
      };

      // Initialize them
      await pipes[this.actor.operatorAddr].xmtp.init(config.NODE_ENV);
      await pipes[this.actor.operatorAddr].http.init();

      // Add "close handlers" for the Pipes
      // They will be called when the program is terminated
      cleanupHandlers.push(async () => {
        this.logger.info(
          `Closing Pipes of Operator ${colorHex(this.actor.operatorAddr)}`
        );
        await Promise.all([
          pipes[this.actor.operatorAddr].xmtp
            .close()
            .then(() => {
              this.logger.info(
                `XMTP pipe of Operator ${colorHex(
                  this.actor.operatorAddr
                )} closed`
              );
            })
            .catch((err) => {
              this.logger.error(
                `Error closing XMTP Pipe of Operator ${colorHex(
                  this.actor.operatorAddr
                )}: ${err}`
              );
            }),
          pipes[this.actor.operatorAddr].http
            .close()
            .then(() => {
              this.logger.info(
                `HTTP Pipe of Operator ${colorHex(
                  this.actor.operatorAddr
                )} closed`
              );
            })
            .catch((err) => {
              this.logger.error(
                `Error closing HTTP Pipe of Operator ${colorHex(
                  this.actor.operatorAddr
                )}: ${err}`
              );
            }),
        ]);
      });

      this.logger.info(
        `Initialized XMTP Pipe for Operator ${yellow.bold(
          this.actor.operatorAddr
        )}`
      );

      this.logger.info(
        `Initialized HTTP Pipe for Operator ${yellow.bold(
          this.actor.operatorAddr
        )} on 0.0.0.0:${this.configuration.OPERATOR_PIPE_PORT}`
      );

      // Initialize the routes
      await this.initOperatorPipeRoutes(this.configuration.GATEWAY);
    }
  }

  /**
   * Initializes the routes available for the Operator.
   */
  private async initOperatorPipeRoutes(isGatewayProvider: boolean) {
    this.operatorRoute(PipeMethods.GET, "/spec", () => this.routeHandlerSpec());
    this.operatorRoute(PipeMethods.GET, "/details", (req) =>
      this.routeHandlerDetails(req)
    );
    this.operatorRoute(PipeMethods.GET, "/resources", (req) =>
      this.routeHandlerResources(req)
    );

    // Setup routes for the Gateway Provider
    if (isGatewayProvider) {
      this.operatorRoute(PipeMethods.GET, "/gateway-provider", () =>
        this.routeHandlerGetInformation()
      );

      this.operatorRoute(PipeMethods.POST, "/virtual-providers", (req) =>
        this.routeHandlerRegisterVirtualProvider(req)
      );
      this.operatorRoute(PipeMethods.POST, "/virtual-providers/offers", (req) =>
        this.routeHandlerRegisterVirtualProviderOffer(req)
      );
      this.operatorRoute(
        PipeMethods.GET,
        "/virtual-provider-configurations",
        (req) => this.routeHandlerGetVirtualProviderConfigurations(req)
      );
      this.operatorRoute(
        PipeMethods.PATCH,
        "/virtual-provider-configurations/:offerId",
        (req) => this.routeHandlerVirtualProviderPatchOfferConfiguration(req)
      );
      this.operatorRoute(
        PipeMethods.GET,
        "/virtual-provider-configurations/:offerId",
        (req) => this.routeHandlerVirtualProviderGetOfferConfiguration(req)
      );
    }
  }

  private async routeHandlerGetInformation() {
    return {
      code: PipeResponseCodes.OK,
      body: {
        details: this.details,
        ownerAddress: this.ownerAddress,
        operatorAddress: this.operatorAccount.address,
        isGateway: this.configuration.GATEWAY,
      },
    };
  }

  private async routeHandlerVirtualProviderGetOfferConfiguration(
    req: PipeRequest
  ) {
    const vprov = this._virtualProviders.findByAddress(
      req.requester as Address
    );
    if (!vprov) {
      throw new PipeErrorUnauthorized();
    }

    const offerIdValidation = z.coerce
      .number({ message: "Offer ID is missing" })
      .safeParse(req.pathParams?.["offerId"]);

    if (offerIdValidation.error) {
      throw new PipeError(PipeResponseCodes.BAD_REQUEST, {
        message: "Invalid Offer ID",
      });
    }

    const offer = await this.protocol
      .getOffer(offerIdValidation.data)
      .catch(() => {
        throw new PipeErrorNotFound("Offer");
      });

    // If the caller is not the owner of this Offer, that means it doesn't have permissions
    if (offer.ownerAddr.toLowerCase() !== vprov.actor.ownerAddr.toLowerCase()) {
      throw new PipeErrorUnauthorized();
    }

    return {
      code: PipeResponseCodes.OK,
      body: await DB.getVirtualProviderConfiguration(
        offerIdValidation.data,
        this.protocol.address
      ),
    };
  }

  private async routeHandlerVirtualProviderPatchOfferConfiguration(
    req: PipeRequest
  ) {
    const vprov = this._virtualProviders.findByAddress(
      req.requester as Address
    );
    if (!vprov) {
      throw new PipeErrorUnauthorized();
    }

    const body = validateBodyOrParams(
      {
        ...(req.body || {}),
        offerId: req.pathParams?.["offerId"], // Get the Offer ID from the path params
      },
      z.object(
        {
          offerId: z.coerce.number(),

          // Configuration will be validated based on the Gateway Provider implementation
          configuration: this.virtualProviderConfigurationSchema,
        },
        { message: "Body is missing" }
      )
    );

    const offer = await this.protocol.getOffer(body.offerId).catch(() => {
      throw new PipeErrorNotFound("Offer");
    });

    if (offer.ownerAddr.toLowerCase() !== vprov.actor.ownerAddr.toLowerCase()) {
      throw new PipeErrorUnauthorized();
    }

    await DB.updateVirtualProviderConfiguration(
      offer.id,
      this.protocol.address,
      body.configuration
    );

    return {
      code: PipeResponseCodes.OK,
      body: {
        message: "Updated",
      },
    };
  }

  private async routeHandlerGetVirtualProviderConfigurations(req: PipeRequest) {
    const vprov = this._virtualProviders.findByAddress(
      req.requester as Address
    );
    if (!vprov) {
      throw new PipeErrorUnauthorized();
    }

    try {
      return {
        code: PipeResponseCodes.OK,
        body: this.availableVirtualProviderConfigurations,
      };
    } catch {
      return {
        code: PipeResponseCodes.INTERNAL_SERVER_ERROR,
        body: {
          message:
            "Available configurations are not defined in the Gateway Provider",
        },
      };
    }
  }

  private async routeHandlerRegisterVirtualProviderOffer(req: PipeRequest) {
    const vprov = this._virtualProviders.findByAddress(
      req.requester as Address
    );

    if (!vprov) {
      throw new PipeErrorUnauthorized();
    }

    const body = validateBodyOrParams(
      req.body,
      z.object(
        {
          detailsFile: z.string(),
          fee: z.string(),
          configuration: this.virtualProviderConfigurationSchema,
          stockAmount: z.number().default(1000),
          existingOfferId: z.coerce.number().optional(),
        },
        { message: "Body is missing" }
      )
    );

    // const gProviderConfig = config.providerConfigurations[this.tag]!;

    const detailsLink = await DB.insertDetailFile(body.detailsFile);

    // TODO: Validate Offer details file if it is in JSON format

    // If `existingOfferId` is given that means the caller already registered an Offer
    // and don't want Gateway Provider register a new one. In that case check the existence
    // of this Offer ID. Otherwise just register a new one.
    const offerId =
      body.existingOfferId !== undefined
        ? await this.protocol.getOffer(body.existingOfferId).then((o) => o.id)
        : await this.protocol.registerOffer({
            providerOwnerAddress: vprov.actor.ownerAddr,
            detailsLink,
            fee: BigInt(body.fee),
            stockAmount: body.stockAmount!,
          });

    // Save the details file to the data/details directory
    writeFileSync(
      join(
        process.cwd(),
        "data",
        "details",
        `vprov.${vprov.actor.ownerAddr.toLowerCase()}.offer.${offerId}.${
          this.protocol.address
        }.details.${detailsLink}.json`
      ),
      body.detailsFile,
      { encoding: "utf-8" }
    );

    await DB.saveVirtualProviderOfferConfiguration({
      offerId,
      protocolAddress: this.protocol.address,
      configuration: body.configuration,
    });
  }

  private async routeHandlerRegisterVirtualProvider(req: PipeRequest) {
    const params = validateBodyOrParams(
      req.body,
      z.object({ detailsFile: z.string() }, { message: "Body is missing" })
    );

    const parsedDetailsFile = tryParseJSON(params.detailsFile);
    if (!parsedDetailsFile) {
      throw new PipeError(PipeResponseCodes.BAD_REQUEST, {
        message: "Invalid details file",
      });
    }

    const validation = ProviderDetailsSchema.safeParse(parsedDetailsFile);
    if (!validation.success) {
      throw new PipeError(PipeResponseCodes.BAD_REQUEST, {
        message: "Validation error in the details file",
        errors: validation.error.issues,
      });
    }

    const vProvider = await this.registry.getActor(req.requester as Address);
    if (!vProvider) {
      throw new PipeError(PipeResponseCodes.NOT_FOUND, {
        message: "Virtual Provider is not registered in the Network",
      });
    }

    if (
      vProvider.operatorAddr.toLowerCase() !==
        this.actor.operatorAddr.toLowerCase() ||
      vProvider.endpoint !== this.actor.endpoint
    ) {
      throw new PipeError(PipeResponseCodes.BAD_REQUEST, {
        message:
          "Virtual Provider is not using Gateway Provider's Operator and Endpoint",
      });
    }

    const cid = await generateCID(params.detailsFile).then((c) => c.toString());
    if (vProvider.detailsLink !== cid) {
      throw new PipeError(PipeResponseCodes.NOT_FOUND, {
        message: "Given details file doesn't belong to the Virtual Provider",
      });
    }

    // Save the details file to data/details directory
    writeFileSync(
      join(
        process.cwd(),
        "data",
        "details",
        `vprov.${vProvider.ownerAddr.toLowerCase()}.details.${cid}.json`
      ),
      params.detailsFile,
      { encoding: "utf-8" }
    );

    // In the next run of the daemon, the details file will be loaded from the
    // data/details directory but for this running daemon, also save it to the database.
    await DB.insertDetailFile(params.detailsFile);

    // Save the Provider as a Virtual Provider into the database
    await DB.saveProvider(
      vProvider.id,
      vProvider.ownerAddr,
      true,

      // This Provider is the Gateway Provider of the Virtual Provider
      this.actor.id
    );

    // Reload the vPROVs from database to memory
    await this.reloadVirtualProviders();

    return {
      code: PipeResponseCodes.OK,
      body: {
        message: "Virtual Provider registered successfully",
      },
    };
  }

  /**
   * Initializes the Protocol client.
   */
  private async setupProtocolClient(protocolAddress?: Address) {
    if (protocolAddress === undefined) {
      const registeredPts = await this.registry.getRegisteredPTsOfProvider(
        this.actor.id
      );

      if (registeredPts.length == 0) {
        throw new Error(
          `Not found any registered Protocol for ${this.logIdentifier()}. Please register within a Protocol and try again`
        );
      }

      protocolAddress = registeredPts[0];
      this.logger.warning(
        `First registered Protocol ${colorHex(
          protocolAddress
        )} is used as the Protocol address`
      );
    } else {
      this.logger.info(`Using Protocol address ${colorHex(protocolAddress)}`);
    }

    this.protocol = new Protocol({
      address: protocolAddress,
      client: rpcClient,
      account: this.operatorAccount,
      registryContractAddress: config.REGISTRY_ADDRESS,
    });
  }

  private async reloadVirtualProviders() {
    const newVProvs = new VirtualProvidersArray();
    const vProviders = await DB.getVirtualProvidersByGatewayProviderId(
      this.actor.id
    );

    // Check existence and validate the each Virtual Provider
    for (const vprov of vProviders) {
      const identifier = `Virtual Provider ${colorHex(
        vprov.ownerAddress
      )} (ID: ${vprov.id})`;
      const vprovActor = await this.registry.getActor(vprov.ownerAddress);

      if (!vprovActor) {
        this.logger.warning(
          `${identifier} is not found in the Network. Be sure that it is registered in the Network. The Virtual Provider won't be used.`
        );
        continue;
      }

      // Check the existence of the details file of the vPROV
      const [detailsFile] = await DB.getDetailFiles([vprovActor.detailsLink]);
      if (!detailsFile) {
        this.logger.warning(
          `Details file of ${identifier} is not found. Check the data/details directory to ensure that the details file is presented. The Virtual Provider won't be used.`
        );
        continue;
      }

      try {
        await this.checkOfferDetailFiles(vprovActor.id, identifier);

        const details = this.validateProviderDetails(
          detailsFile.content,
          identifier
        );

        newVProvs.push({
          actor: vprovActor,
          details,
        });

        this.logger.info(
          `Virtual Provider ${colorHex(vprovActor.ownerAddr)} (ID: ${
            vprovActor.id
          }) initialized successfully`
        );
      } catch (err) {
        const error = ensureError(err);
        this.logger.warning(error.message);
        this.logger.warning(`${identifier} won't be used.`);
      }
    }

    // Only update the vPROV when the function reaches out to the end
    this._virtualProviders = newVProvs;

    // Define the existing routes also for the new Virtual Providers
    // so the requests are coming to those vPROVs will be processed by this class.
    defineProviderRoutesForVirtualProviders(this);
  }

  /**
   * Setups everything that is needed by the Provider and checks
   * its and its Virtual Providers existence in the Network, validates detail files etc.
   */
  private async setup() {
    // Initialize Registry client
    this.setupRegistryClient();

    this.logger.info("Checking in Network Actor registration");
    const provider = await this.registry.getActor(this.ownerAddress);
    if (!provider) {
      throw new Error(
        `${this.logIdentifier()} is not registered in the Network as a Provider. Please register it and try again.`
      );
    }

    this.actor = provider;
    this.actorInfo = provider;

    // Check if the details file of that Provider is presented in this daemon
    const [provDetailFile] = await DB.getDetailFiles([this.actor.detailsLink]);
    if (!provDetailFile) {
      throw new Error(
        `Details file not found for ${this.logIdentifier()}. Please ensure that you've placed the details of the Provider into "data/details/[filename].json"`
      );
    }

    // Validate the details file of the Provider
    this.details = this.validateProviderDetails(provDetailFile.content);

    // Initialize the Protocol client since we need to call some Protocol functions
    await this.setupProtocolClient(this.configuration.PROTOCOL_ADDRESS);

    // Check if all the detail files of all the Offers of this Provider in the target Protocol are presented
    await this.checkOfferDetailFiles(this.actor.id, this.logIdentifier());

    // If this is a Gateway Provider, load the registered vPROVs from
    // the database and check their existence in the Network
    if (this.configuration.GATEWAY) {
      await this.reloadVirtualProviders();
    }

    // TODO: Check for the Offer detail files

    // Save the Provider to the database
    await DB.saveProvider(this.actor.id, this.actor.ownerAddr);

    // Initialize the Pipes for this Operator address if it is not initialized yet.
    await this.initPipes();
  }

  private async checkOfferDetailFiles(actorId: number, identifier: string) {
    const offers = await this.protocol.getAllProviderOffers(actorId);
    const offerCIDs = offers.map((o) => o.detailsLink);
    const detailFiles = await DB.getDetailFiles(offerCIDs);
    for (const offer of offers) {
      // Only force having detail files of the active Offers
      if (offer.status !== Status.Active) {
        continue;
      }

      const detailsFile = detailFiles.find(
        (df) => df.cid === offer.detailsLink
      );
      if (!detailsFile) {
        throw new Error(
          `Details file of Offer ${offer.id} @ ${this.protocol.address} of ${identifier} is not found. Please ensure that you've placed the details into "data/details/[filename].json"`
        );
      }
    }
  }

  /**
   * Parses and validates the given details file content as Provider details.
   * @param content
   */
  private validateProviderDetails(content: string, identifier?: string) {
    const detailsObject = tryParseJSON(content);
    if (!detailsObject) {
      throw new Error(
        `Details file of ${
          identifier ?? this.logIdentifier()
        } is not a valid JSON file`
      );
    }

    const detailsValidation = ProviderDetailsSchema.safeParse(detailsObject);
    if (!detailsValidation.success) {
      throw new Error(
        `Details file of ${identifier ?? this.logIdentifier()} is invalid: ${
          detailsValidation.error.message
        }`
      );
    }
    return detailsValidation.data;
  }

  private buildLogger() {
    let context = this.constructor.name;
    if (this.tag) {
      context += `(${this.tag})`;
    }

    return logger.child({ context });
  }

  /**
   * Builds a string that can be used in the logs to identify the Provider.
   * The string includes the owner address, ID, and the tag (if they exist).
   */
  private logIdentifier(id?: number, address?: Address, isVirtual?: boolean) {
    const identifiers: string[] = [];
    let str = `Provider`;

    if (isVirtual) {
      str = `Virtual ${str}`;
    }

    // This function may be called before the fields are set so check their existence
    if (address || this.ownerAddress || this.actor?.ownerAddr) {
      identifiers.push(
        `${colorHex(address ?? this.ownerAddress ?? this.actor?.ownerAddr)}`
      );
    }
    if (id !== undefined || this.actor) {
      identifiers.push(`ID: ${id ?? this.actor.id}`);
    }

    if (this.tag) {
      identifiers.push(`tag: ${this.tag}`);
    }

    if (identifiers.length > 0) {
      str += ` (${identifiers.join(", ")})`;
    }

    return str;
  }

  public get availableVirtualProviderConfigurations(): Record<
    string,
    VirtualProviderConfigurationInformation
  > {
    throw new Error(`This method must be implemented by the Gateway Provider`);
  }

  public get virtualProviderConfigurationSchema(): z.Schema<any> {
    throw new Error(`This method must be implemented by the Gateway Provider`);
  }

  /**
   * Gets a resource that stored in the database and the corresponding agreement from blockchain
   * @param id ID of the resource/agreement
   * @param ptAddress Protocol address
   * @param requester Requester of this resource
   */
  protected async getResource(
    id: number,
    ptAddress: Address,
    requester: string
  ) {
    const resource = await DB.getResource(id, requester, ptAddress);

    if (
      !resource || // Resource does not exist
      !resource.isActive || // Agreement of the resource is closed
      // Resource is not belong to this Provider
      // or any of its Virtual Providers
      (resource.providerId !== this.actor.id &&
        resource.providerId !==
          this._virtualProviders.findByResource(resource)?.actor.id)
    ) {
      throw new PipeErrorNotFound("Resource");
    }

    const agreement = await this.protocol.getAgreement(resource.id); // Retrieve the agreement details from chain

    return {
      resource,
      agreement,
      protocol: this.protocol,
    };
  }

  /**
   * Setups a route for specific to this Provider. The request that
   * are being made to this route has to include either `body.providerId` or
   * `params.providerId` field that points to the Provider's ID.
   */
  protected route(
    method: PipeMethodType,
    path: `/${string}`,
    handler: ProviderPipeRouteHandler
  ) {
    pipeProviderRoute(this, method, path, handler);
  }

  /**
   * Setups a route for this Provider's Operator.
   */
  protected operatorRoute(
    method: PipeMethodType,
    path: `/${string}`,
    handler: PipeRouteHandler
  ) {
    pipeOperatorRoute(this.actor.operatorAddr, method, path, handler);
  }

  /**
   * Creates the actual resource based. Called based on the blockchain agreement creation event.
   * @param agreement On-chain Agreement data
   * @param offer On-chain Offer data and details (if exists)
   */
  abstract create(agreement: Agreement, offer: DetailedOffer): Promise<T>;

  /**
   * Fetches/retrieves the details about the resource from the resource itself
   * @param agreement On-chain Agreement data
   * @param offer On-chain Offer data and details (if exists)
   * @param resource Current details stored in the database
   */
  abstract getDetails(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<T>;

  /**
   * Deletes the actual resource based. Called based on the blockchain agreement closing event.
   * @param agreement On-chain Agreement data
   * @param offer On-chain Offer data and details (if exists)
   * @param resource Current details stored in the database
   */
  abstract delete(
    agreement: Agreement,
    offer: DetailedOffer,
    resource: Resource
  ): Promise<void>;
}

/**
 * An array class specially designed for holding Virtual Providers
 */
class VirtualProvidersArray extends Array<VirtualProvider> {
  findById(id: number) {
    return this.find((vprov) => vprov.actor.id === id);
  }
  findByAddress(ownerAddress: Address) {
    return this.find(
      (vprov) =>
        vprov.actor.ownerAddr.toLowerCase() === ownerAddress.toLowerCase()
    );
  }
  findByResource(resource: Resource) {
    return this.findById(resource.providerId);
  }
  findByOffer(offer: Offer) {
    return this.findByAddress(offer.ownerAddr);
  }
}

export type VirtualProvider = {
  actor: Provider;
  details: ProviderDetails;
};

export type VirtualProviderConfigurationInformation = {
  example: string;
  format?: string | string[];
  description?: string;
  required?: boolean;
  default?: string;
};
