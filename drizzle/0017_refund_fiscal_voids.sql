ALTER TABLE "fiscal_documents"
  ADD COLUMN "payment_refund_id" uuid;
--> statement-breakpoint
ALTER TABLE "fiscal_documents"
  ADD CONSTRAINT "fiscal_documents_payment_refund_id_payment_refunds_id_fk"
  FOREIGN KEY ("payment_refund_id") REFERENCES "public"."payment_refunds"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_documents_payment_refund_void_uq"
  ON "fiscal_documents" USING btree ("payment_refund_id")
  WHERE "payment_refund_id" IS NOT NULL AND "type" = 'VOID';
--> statement-breakpoint
CREATE INDEX "fiscal_documents_order_refund_idx"
  ON "fiscal_documents" USING btree
  ("organization_id", "order_id", "payment_refund_id", "created_at");
