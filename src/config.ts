import { z } from "zod";
import { cyan, red } from "ansis";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import {
  addressSchema,
  ForestRegistryAddress,
  getContractAddressByChain,
  privateKeySchema,
  setGlobalRateLimit,
} from "@forest-protocols/sdk";
import { nonEmptyStringSchema } from "./validation/schemas";
import { fromError } from "zod-validation-error";
import { Address } from "viem";

function parseEnv() {
  const environmentSchema = z.object({
    DATABASE_URL: nonEmptyStringSchema,
    LOG_LEVEL: z.enum(["error", "warning", "info", "debug"]).default("debug"),
    NODE_ENV: z.enum(["dev", "production"]).default("dev"),
    RPC_HOST: nonEmptyStringSchema,
    CHAIN: z.enum(["anvil", "optimism", "optimism-sepolia"]).default("anvil"),
    PORT: z.coerce.number().default(3000),
    RATE_LIMIT: z.coerce.number().default(20),
    REGISTRY_ADDRESS: addressSchema.optional(),
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

  return parsedEnv.data;
}

function parseProviderConfig() {
  const providerSchema = z.object({
    providerWalletPrivateKey: privateKeySchema,
    billingWalletPrivateKey: privateKeySchema,
    operatorWalletPrivateKey: privateKeySchema,
  });

  const providers: {
    [providerTag: string]: z.infer<typeof providerSchema>;
  } = {};

  const path = join(process.cwd(), "data/providers.json");

  if (statSync(path, { throwIfNoEntry: false })?.isFile()) {
    try {
      const fileContent = readFileSync(path).toString();
      const rootObject = JSON.parse(fileContent);
      console.log(`Reading ${cyan("providers.json")}`);

      for (const [name, info] of Object.entries(rootObject)) {
        // Validate each provider object
        const provider = providerSchema.safeParse(info, {});
        if (provider.error) {
          throw new Error(fromError(provider.error).toString());
        }

        providers[name] = provider.data!;
      }
    } catch (err: any) {
      console.error(red(`Invalid providers.json file: ${err.message}`));
      process.exit(1);
    }
  } else {
    const regex = /^(PROVIDER|BILLING|OPERATOR)_PRIVATE_KEY_([\w]+)$/;
    for (const [name, value] of Object.entries(process.env)) {
      const match = name.match(regex);
      if (match) {
        const keyType = match[1];
        const providerTag = match[2];

        if (!providers[providerTag]) {
          providers[providerTag] = {
            billingWalletPrivateKey: "0x",
            operatorWalletPrivateKey: "0x",
            providerWalletPrivateKey: "0x",
          };
        }

        switch (keyType) {
          case "PROVIDER":
            providers[providerTag].providerWalletPrivateKey = value as Address;
            break;
          case "OPERATOR":
            providers[providerTag].operatorWalletPrivateKey = value as Address;
            break;
          case "BILLING":
            providers[providerTag].billingWalletPrivateKey = value as Address;
            break;
        }
      }
    }

    for (const [providerTag, keys] of Object.entries(providers)) {
      const validation = providerSchema.safeParse(keys);

      if (validation.error) {
        const error = validation.error.errors[0];
        console.error(
          red(
            `Invalid Provider configuration for tag "${providerTag}": ${error.path}: ${error.message}`
          )
        );
        process.exit(1);
      }
    }
  }

  return providers;
}

const env = parseEnv();

export const config = {
  ...env,
  providers: parseProviderConfig(),
  registryAddress: getContractAddressByChain(env.CHAIN, ForestRegistryAddress),
};
