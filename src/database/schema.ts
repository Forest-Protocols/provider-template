import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { DeploymentStatus } from "@forest-protocols/sdk";

export const resourcesTable = pgTable(
  "resources",
  {
    id: integer("id").notNull(),
    name: varchar({ length: 100 }).notNull(),
    ownerAddress: varchar("owner_address", { length: 100 }).notNull(),
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
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.ptAddressId],
    }),
  ]
);
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

export const providersTable = pgTable("providers", {
  id: integer("id").primaryKey(),
  ownerAddress: varchar("owner_address", { length: 65 }).notNull().unique(),
});
relations(providersTable, ({ many, one }) => ({
  resources: many(resourcesTable),
}));

export const protocolsTable = pgTable("protocols", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  address: varchar({ length: 100 }).notNull().unique(),
});
relations(protocolsTable, ({ many, one }) => ({
  resources: many(resourcesTable),
}));

export const blockchainTxsTable = pgTable(
  "blockchain_transactions",
  {
    height: bigint({ mode: "bigint" }).notNull(),
    hash: varchar({ length: 70 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.height, table.hash],
    }),
  ]
);

export const detailFilesTable = pgTable("detail_files", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  cid: varchar({ length: 100 }).notNull().unique(),
  content: text().notNull(),
});

export type DbDetailFileInsert = typeof detailFilesTable.$inferInsert;
export type DbResource = typeof resourcesTable.$inferSelect;
export type DbResourceInsert = typeof resourcesTable.$inferInsert;
