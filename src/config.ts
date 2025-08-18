import { z } from "zod";
import { red } from "ansis";
import {
  AddressSchema,
  setGlobalRateLimit,
  setGlobalRateLimitTimeWindow,
} from "@forest-protocols/sdk";
import { nonEmptyStringSchema } from "./validation/schemas";
import { Address } from "viem";
import { parseTime } from "./utils/parse-time";
import { ProviderConfig, ProviderConfigSchema } from "./validation/provider";
import dotenv from "@dotenvx/dotenvx";

function parseEnv() {
  const environmentSchema = z.object({
    FAUCET_ETH_AMOUNT: z.string().default("0.00075"),
    FAUCET_TIME_WINDOW: z
      .string()
      .default("24h")
      .transform((value, ctx) => parseTime(value, ctx)),
    DATABASE_URL: nonEmptyStringSchema,
    LOG_LEVEL: z.enum(["error", "warning", "info", "debug"]).default("debug"),
    NODE_ENV: z.enum(["dev", "production"]).default("dev"),
    RPC_HOST: nonEmptyStringSchema,
    CHAIN: z
      .enum(["anvil", "optimism", "optimism-sepolia", "base", "base-sepolia"])
      .default("anvil"),
    PORT: z.coerce.number().default(3000),
    RATE_LIMIT: z.coerce.number().default(20),
    RATE_LIMIT_WINDOW: z
      .string()
      .default("1s")
      .transform((value, ctx) => parseTime(value, ctx)),
    REGISTRY_ADDRESS: AddressSchema.optional(),
    TOKEN_ADDRESS: AddressSchema.optional(),
    INDEXER_ENDPOINT: z.string().url().optional(),
    AGREEMENT_CHECK_INTERVAL: z
      .string()
      .default("5s")
      .transform((value, ctx) => parseTime(value, ctx)),
    AGREEMENT_BALANCE_CHECK_INTERVAL: z
      .string()
      .default("5m")
      .transform((value, ctx) => parseTime(value, ctx)),
    BLOCK_PROCESS_RANGE: z.coerce.bigint().default(1000n),
  });
  const parsedEnv = environmentSchema.safeParse(process.env, {});

  if (parsedEnv.error) {
    const error = parsedEnv.error.errors[0];
    console.error(
      red(
        `Error while parsing environment variable "${error.path}": ${error.message}`
      )
    );
    process.exit(1);
  }

  // Set global rate limit based on the given value (or default)
  setGlobalRateLimit(parsedEnv.data.RATE_LIMIT);
  setGlobalRateLimitTimeWindow(parsedEnv.data.RATE_LIMIT_WINDOW);

  return parsedEnv.data;
}

function parseProviderConfig() {
  const providers: Record<
    string,
    ProviderConfig & {
      // Include the following fields for backward compatibility

      /**
       * @deprecated Use "BILLING_PRIVATE_KEY" instead
       */
      billingWalletPrivateKey: Address;

      /**
       * @deprecated Use "OPERATOR_PRIVATE_KEY" instead
       */
      operatorWalletPrivateKey: Address;

      /**
       * @deprecated Use "PROVIDER_PRIVATE_KEY" instead
       */
      providerWalletPrivateKey: Address;

      /**
       * @deprecated Use "OPERATOR_PIPE_PORT" instead
       */
      operatorPipePort: number;

      /**
       * @deprecated Use "PROTOCOL_ADDRESS" instead
       */
      protocolAddress?: Address;
    }
  > = {};
  const regex =
    /^(?<keyType>((PROVIDER|BILLING|OPERATOR)_PRIVATE_KEY)|OPERATOR_PIPE_PORT|PROTOCOL_ADDRESS|GATEWAY)_(?<providerTag>[\w]+)$/;
  for (const [name, value] of Object.entries(process.env)) {
    const match = name.match(regex);
    if (match) {
      const keyType = match.groups?.keyType as string;
      const providerTag = match.groups?.providerTag as string;

      if (!providers[providerTag]) {
        providers[providerTag] = {
          BILLING_PRIVATE_KEY: "0x",
          OPERATOR_PRIVATE_KEY: "0x",
          PROVIDER_PRIVATE_KEY: "0x",
          OPERATOR_PIPE_PORT: 0,
          GATEWAY: false,

          billingWalletPrivateKey: "0x",
          operatorWalletPrivateKey: "0x",
          providerWalletPrivateKey: "0x",
          operatorPipePort: 0,
        };
      }

      switch (keyType) {
        case "PROVIDER_PRIVATE_KEY":
          providers[providerTag].PROVIDER_PRIVATE_KEY = value as Address;
          break;
        case "OPERATOR_PRIVATE_KEY":
          providers[providerTag].OPERATOR_PRIVATE_KEY = value as Address;
          break;
        case "BILLING_PRIVATE_KEY":
          providers[providerTag].BILLING_PRIVATE_KEY = value as Address;
          break;
        case "OPERATOR_PIPE_PORT":
          providers[providerTag].OPERATOR_PIPE_PORT = parseInt(value as string);
          break;
        case "PROTOCOL_ADDRESS":
          providers[providerTag].PROTOCOL_ADDRESS = value as Address;
          break;
        case "GATEWAY":
          providers[providerTag].GATEWAY = value?.toLowerCase() === "true";
          break;
      }
    }
  }

  for (const [tag, configuration] of Object.entries(providers)) {
    const validation = ProviderConfigSchema.safeParse(configuration);

    if (validation.error) {
      const error = validation.error.errors[0];
      console.error(
        red(
          `Invalid Provider configuration for tag "${tag}": ${error.path}: ${error.message}`
        )
      );
      process.exit(1);
    }

    providers[tag] = {
      ...configuration,

      // Fill out the old fields for backward compatibility
      operatorPipePort: configuration.OPERATOR_PIPE_PORT,
      providerWalletPrivateKey: configuration.PROVIDER_PRIVATE_KEY,
      operatorWalletPrivateKey: configuration.OPERATOR_PRIVATE_KEY,
      billingWalletPrivateKey: configuration.BILLING_PRIVATE_KEY,
      protocolAddress: configuration.PROTOCOL_ADDRESS,
    };
  }
  return providers;
}

// Load the env file if there is one.
// Ignore the error if the file is not found.
dotenv.config({ ignore: ["MISSING_ENV_FILE"], quiet: true });

const env = parseEnv();

const providerConfigurations = parseProviderConfig();

export const config = {
  ...env,

  /**
   * @deprecated Use "providerConfigurations" instead
   */
  providers: providerConfigurations,
  providerConfigurations,
};
