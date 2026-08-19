ALTER TYPE "public"."fiscal_provider"
  ADD VALUE IF NOT EXISTS 'ADE_WEB';

ALTER TYPE "public"."fiscal_document_status"
  ADD VALUE IF NOT EXISTS 'UNKNOWN';

ALTER TYPE "public"."fiscal_document_status"
  ADD VALUE IF NOT EXISTS 'AUTH_REQUIRED';

ALTER TYPE "public"."fiscal_attempt_outcome"
  ADD VALUE IF NOT EXISTS 'UNKNOWN';

ALTER TYPE "public"."fiscal_attempt_outcome"
  ADD VALUE IF NOT EXISTS 'AUTH_REQUIRED';
