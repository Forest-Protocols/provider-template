import { z } from "zod";
import { cyan, red } from "ansis";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ForestRegistryAddress,
  getContractAddressByChain,
  privateKeySchema,
} from "@forest-protocols/sdk";
import { nonEmptyStringSchema } from "./validation/schemas";
import { fromError } from "zod-validation-error";

function parseEnv() {
  const environmentSchema = z.object({
    DATABASE_URL: nonEmptyStringSchema,
    LOG_LEVEL: z.enum(["error", "warning", "info", "debug"]).default("debug"),
    NODE_ENV: z.enum(["dev", "production"]).default("dev"),
    RPC_HOST: nonEmptyStringSchema,
    CHAIN: z.enum(["anvil", "optimism", "optimism-sepolia"]).default("anvil"),
  });
  const parsedEnv = environmentSchema.safeParse(process.env, {});

  if (parsedEnv.error) {
    console.error(
      "Error while parsing environment variables:",
      red(fromError(parsedEnv).toString())
    );
    process.exit(1);
  }

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

  try {
    const fileContent = readFileSync(
      join(process.cwd(), "data/providers.json")
    ).toString();
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

  return providers;
}

const env = parseEnv();

export const config = {
  ...env,
  providers: parseProviderConfig(),
  registryAddress: getContractAddressByChain(env.CHAIN, ForestRegistryAddress),
};
