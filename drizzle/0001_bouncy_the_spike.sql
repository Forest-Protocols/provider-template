ALTER TABLE "product_categories" RENAME TO "protocols";--> statement-breakpoint
ALTER TABLE "resources" RENAME COLUMN "pc_address_id" TO "pt_address_id";--> statement-breakpoint
ALTER TABLE "protocols" DROP CONSTRAINT "product_categories_address_unique";--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_pc_address_id_product_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_id_pc_address_id_pk";--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_id_pt_address_id_pk" PRIMARY KEY("id","pt_address_id");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_pt_address_id_protocols_id_fk" FOREIGN KEY ("pt_address_id") REFERENCES "public"."protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_address_unique" UNIQUE("address");