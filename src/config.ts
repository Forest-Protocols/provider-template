import { z } from "zod";
import { cyan, red } from "ansis";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  addressSchema,
  ForestRegistryAddress,
  getContractAddressByChain,
  OfferDetailsSchema,
  privateKeySchema,
  ProductCategoryDetailsSchema,
  ProviderDetailsSchema,
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

function parseProductCategories() {
  const pcSchema = z.object({
    address: addressSchema.transform((value) => value.toLowerCase()),
    details: ProductCategoryDetailsSchema,
  });

  const productCategories: {
    [address: string]: z.infer<typeof pcSchema>;
  } = {};

  try {
    const basePath = join(process.cwd(), "data/product-categories");
    const files = readdirSync(basePath, { recursive: true });
    for (const file of files) {
      if (!file.toString().endsWith(".json")) {
        continue;
      }

      console.log(`Reading product category details from ${cyan(file)}`);
      const content = readFileSync(join(basePath, file.toString())).toString();
      const rawObject = JSON.parse(content);
      const validation = pcSchema.safeParse(rawObject);

      if (validation.error) {
        throw new Error(fromError(validation.error).toString());
      }

      const obj = validation.data;
      productCategories[obj.address] = obj;
    }
  } catch (err: any) {
    console.error(
      red(`Error while reading product categories: ${err.message}`)
    );
    process.exit(1);
  }

  return productCategories;
}

function parseProviders() {
  const providerSchema = z.object({
    details: ProviderDetailsSchema,
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

function parseOffers() {
  const offerSchema = z.object({
    id: z.number(),
    productCategory: addressSchema.transform((value) => value.toLowerCase()),
    deploymentParams: z.any(),
    details: OfferDetailsSchema,
  });

  const offers: {
    [pcAddress: string]: z.infer<typeof offerSchema>[];
  } = {};

  try {
    const basePath = join(process.cwd(), "data/offers");
    const files = readdirSync(basePath, { recursive: true });
    for (const file of files) {
      if (!file.toString().endsWith(".json")) {
        continue;
      }

      console.log(`Reading offer from ${cyan(file)}`);
      const content = readFileSync(join(basePath, file.toString())).toString();
      const rawObject = JSON.parse(content);
      const validation = offerSchema.safeParse(rawObject);

      if (validation.error) {
        throw new Error(fromError(validation.error).toString());
      }

      const offer = validation.data;

      if (!offers[offer.productCategory]) {
        offers[offer.productCategory] = [];
      }
      offers[offer.productCategory].push(offer);
    }
  } catch (err: any) {
    console.error(red(`Error while reading offers: ${err.message}`));
    process.exit(1);
  }

  return offers;
}

const env = parseEnv();

export const config = {
  ...env,
  providers: parseProviders(),
  productCategories: parseProductCategories(),
  offers: parseOffers(),
  registryAddress: getContractAddressByChain(env.CHAIN, ForestRegistryAddress),
};
