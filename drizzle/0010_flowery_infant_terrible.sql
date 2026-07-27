ALTER TABLE "reservations" ADD COLUMN "payment_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "reservations_payment_expiry_idx" ON "reservations" USING btree ("status","payment_expires_at");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_payment_expiry_ck" CHECK ((
        ("reservations"."status" = 'PENDING_PAYMENT' and "reservations"."payment_expires_at" is not null)
        or
        ("reservations"."status" <> 'PENDING_PAYMENT')
      ));