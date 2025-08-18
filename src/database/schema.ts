import { relations } from "drizzle-orm";
import {
  boolean,
  customType,
  foreignKey,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { DeploymentStatus } from "@forest-protocols/sdk";
import { Address } from "viem";

/**
 * This type generates "undefined"."citext" for unknown reason.
 * Follow the issue for more details:
 * https://github.com/drizzle-team/drizzle-orm/issues/4806
 *
 * More info about citext:
 * https://www.cybertec-postgresql.com/en/case-insensitive-pattern-matching-in-postgresql/
 *
 * Notes from the article above:
 * - there is no data type civarchar, so you can only implement that with a check constraint
 * - performance for longer values can also be bad, because citext internally calls lower(col COLLATE "default") before comparing the values
 * - regular expression matching is not case insensitive, and you have to use the case insensitive operator ~* explicitly
 */
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * Public ethereum address
 */
function address(name: string) {
  // Addresses are case-insensitive
  return citext(name).$type<Address>();
}

/**
 * The table that stores all the created Resources from the Agreements.
 * NOTE: ID of the Resource is the same as the Agreement ID.
 */
export const resourcesTable = pgTable(
  "resources",
  {
    id: integer("id").notNull(),
    name: varchar({ length: 100 }).notNull(),
    ownerAddress: address("owner_address").notNull(),
    details: json().$type<any>().default({}).notNull(),
    deploymentStatus: varchar("deployment_status", { length: 20 })
      .$type<DeploymentStatus>()
      .notNull(),
    groupName: varchar("group_name", { length: 100 })
      .default("default")
      .notNull(),
    offerId: integer("offer_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    providerId: integer("provider_id")
      .references(() => providersTable.id)
      .notNull(),
    ptAddressId: integer("pt_address_id")
      .references(() => protocolsTable.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.ptAddressId],
    }),
  ]
);

// Relation definitions for `.query` usage
relations(resourcesTable, ({ one }) => ({
  provider: one(providersTable, {
    fields: [resourcesTable.providerId],
    references: [providersTable.id],
  }),
  protocol: one(protocolsTable, {
    fields: [resourcesTable.ptAddressId],
    references: [protocolsTable.id],
  }),
}));

// Raw DB types
export type DbResource = typeof resourcesTable.$inferSelect;
export type DbResourceInsert = typeof resourcesTable.$inferInsert;

/**
 * The table that stores configured Providers for this daemon.
 */
export const providersTable = pgTable(
  "providers",
  {
    id: integer("id").primaryKey(),
    ownerAddress: address("owner_address").notNull().unique(),
    isVirtual: boolean("is_virtual").notNull().default(false),

    // If the Provider is a vPROV then it must have a parent
    // Gateway Provider in order to use its Operator private key for the actions.
    // This column points to that Gateway Provider's ID.
    gatewayProviderId: integer("gateway_provider_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.gatewayProviderId],
      foreignColumns: [table.id],
    }),
  ]
);

// Relation definitions for `.query` usage
relations(providersTable, ({ many, one }) => ({
  resources: many(resourcesTable),
  gatewayProvider: one(providersTable, {
    fields: [providersTable.gatewayProviderId],
    references: [providersTable.id],
  }),
}));

// Raw DB types
export type DbProvider = typeof providersTable.$inferSelect;

/**
 * The table that stores all the used Protocols by the configured Providers for this daemon.
 */
export const protocolsTable = pgTable("protocols", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  address: address("address").notNull().unique(),
});

// Relation definitions for `.query` usage
relations(protocolsTable, ({ many }) => ({
  resources: many(resourcesTable),
}));

/**
 * The table that stores all the runtime configurations of the daemon.
 */
export const configTable = pgTable("config", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  key: varchar({ length: 300 }).notNull().unique(),
  value: text().notNull(),
});

/**
 * The table that stores all the detail files that are placed under data/details folder.
 * NOTE: This table is synced with the data/details folder at the startup of the daemon.
 */
export const detailFilesTable = pgTable("detail_files", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  cid: varchar({ length: 100 }).notNull().unique(),
  content: text().notNull(),
});

// Raw DB types
export type DbDetailFileInsert = typeof detailFilesTable.$inferInsert;

/**
 * The table that stores the configurations of the Virtual Providers Offers.
 */
export const virtualProviderOfferConfigurations = pgTable(
  "virtual_provider_offer_configurations",
  {
    id: integer("id").notNull(),
    configuration: jsonb().$type<any>().default({}).notNull(),
    ptAddressId: integer("pt_address_id")
      .references(() => protocolsTable.id)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.ptAddressId],
    }),
  ]
);

// Relation definitions for `.query` usage
relations(virtualProviderOfferConfigurations, ({ one }) => ({
  protocol: one(protocolsTable, {
    fields: [virtualProviderOfferConfigurations.ptAddressId],
    references: [protocolsTable.id],
  }),
}));

export const faucetUsages = pgTable("faucet_usages", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  address: address("address").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
});
