[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $SkipVerify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonScript = Join-Path -Path $PSScriptRoot -ChildPath 'Phase2.Common.ps1'

if (-not (Test-Path -LiteralPath $commonScript)) {
    throw "File condiviso non trovato: $commonScript"
}

. $commonScript

function Assert-CleanTrackedTree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    $changes = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @('status', '--short', '--untracked-files=no') `
            -WorkingDirectory $RepositoryRoot
    )

    if ($changes.Count -gt 0) {
        $details = $changes -join [Environment]::NewLine

        throw @"
Sono presenti modifiche tracciate non salvate:

$details

Completa il commit della Fase 05 oppure usa git stash.
"@
    }
}

function Write-GeneratedFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    if (Test-Path -LiteralPath $Path) {
        $existing = [System.IO.File]::ReadAllText($Path)

        if (-not $existing.Contains('PHASE_6_STRIPE_RESERVATION_PAYMENTS')) {
            throw @"
Il file esiste ma non appartiene alla Fase 06:

$Path

Lo script si ferma per evitare una sovrascrittura.
"@
        }
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Write-ExpectedPhaseFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [Parameter(Mandatory)]
        [string] $RequiredMarker,

        [switch] $DryRun
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File atteso non trovato: $Path"
    }

    $existing = [System.IO.File]::ReadAllText($Path)

    if (
        -not $existing.Contains($RequiredMarker) -and
        -not $existing.Contains('PHASE_6_STRIPE_RESERVATION_PAYMENTS')
    ) {
        throw "Il file non coincide con la fase precedente attesa: $Path"
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Enable-RawBody {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")

    if (-not $content.Contains('rawBody: true')) {
        $anchor =
            '  const app = await NestFactory.create(AppModule, { bufferLogs: true });'

        if (-not $content.Contains($anchor)) {
            throw 'Chiamata NestFactory.create attesa non trovata.'
        }

        $replacement = @'
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
'@
        $content = $content.Replace($anchor, $replacement.TrimEnd())
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Update-EnvironmentSchema {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")

    if (-not $content.Contains('STRIPE_SECRET_KEY:')) {
        $anchor =
            "    CORS_ORIGINS: z.string().default('http://localhost:3000'),"

        if (-not $content.Contains($anchor)) {
            throw 'Anchor CORS_ORIGINS non trovato in environment.ts.'
        }

        $block = @'
    BOOKING_WEB_BASE_URL: z
      .string()
      .url()
      .default('http://localhost:3000'),
    STRIPE_SECRET_KEY: z.string().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),
'@

        $content = $content.Replace(
            $anchor,
            $anchor + "`n" + $block.TrimEnd()
        )
    }

    if (-not $content.Contains("'STRIPE_SECRET_KEY', 'must start with sk_live_'")) {
        $anchor =
            "    if (['debug', 'trace'].includes(environment.LOG_LEVEL)) {"

        if (-not $content.Contains($anchor)) {
            throw 'Anchor LOG_LEVEL non trovato in environment.ts.'
        }

        $block = @'
    if (!environment.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
      addIssue('STRIPE_SECRET_KEY', 'must start with sk_live_');
    }
    if (!environment.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
      addIssue('STRIPE_WEBHOOK_SECRET', 'must start with whsec_');
    }
    try {
      const bookingUrl = new URL(environment.BOOKING_WEB_BASE_URL);
      if (
        bookingUrl.protocol !== 'https:' ||
        localHost.test(bookingUrl.hostname)
      ) {
        addIssue(
          'BOOKING_WEB_BASE_URL',
          'must be a non-local HTTPS URL',
        );
      }
    } catch {
      addIssue('BOOKING_WEB_BASE_URL', 'must be a valid URL');
    }

'@

        $content = $content.Replace(
            $anchor,
            $block + $anchor
        )
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Update-EnvironmentSpec {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")

    if (-not $content.Contains("STRIPE_SECRET_KEY: 'sk_live_")) {
        $anchor = "  CORS_ORIGINS: 'https://pos.example.com',"

        if (-not $content.Contains($anchor)) {
            throw 'Anchor CORS_ORIGINS non trovato in environment.spec.ts.'
        }

        $block = @'
  BOOKING_WEB_BASE_URL: 'https://booking.example.com',
  STRIPE_SECRET_KEY: `sk_live_${'s'.repeat(48)}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(48)}`,
'@

        $content = $content.Replace(
            $anchor,
            $anchor + "`n" + $block.TrimEnd()
        )
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Update-EnvironmentExample {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")

    if (-not $content.Contains('STRIPE_WEBHOOK_SECRET=')) {
        $block = @'

# Stripe reservation payments
BOOKING_WEB_BASE_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
'@

        $content = $content.TrimEnd() + "`n" + $block.TrimStart()
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Assert-NoPosPaymentChanges {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    $changes = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @(
                'diff',
                '--name-only',
                '--',
                'apps/api/src/payments'
            ) `
            -WorkingDirectory $RepositoryRoot
    )

    if ($changes.Count -gt 0) {
        throw @"
La Fase 06 ha modificato il dominio POS payments:

$($changes -join [Environment]::NewLine)
"@
    }
}

$repositoryRoot = Get-RepositoryRoot
$reservationsModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/reservations/reservations.module.ts'
$mainPath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/main.ts'
$environmentPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/config/src/environment.ts'
$environmentSpecPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/config/src/environment.spec.ts'
$environmentExamplePath = Join-Path -Path $repositoryRoot -ChildPath '.env.example'
$phaseFiveService = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/reservations/reservation-conversion.service.ts'

Write-Step -Message 'Preflight Fase 06'

Assert-RepoRoot -Path $repositoryRoot
Assert-Command -Name 'git'
Assert-Command -Name 'node'

$npmCommand = if ($env:OS -eq 'Windows_NT') {
    'npm.cmd'
}
else {
    'npm'
}

$npxCommand = if ($env:OS -eq 'Windows_NT') {
    'npx.cmd'
}
else {
    'npx'
}

Assert-Command -Name $npmCommand
Assert-Command -Name $npxCommand
Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot
Assert-CleanTrackedTree -RepositoryRoot $repositoryRoot

$currentBranch = Get-CurrentGitBranch -RepositoryRoot $repositoryRoot

if ($currentBranch -eq 'main') {
    throw 'La Fase 06 non può essere eseguita direttamente su main.'
}

if (-not (Test-Path -LiteralPath $phaseFiveService)) {
    throw "Conversione Fase 05 non trovata: $phaseFiveService"
}

$phaseFiveContent = [System.IO.File]::ReadAllText($phaseFiveService)

if (-not $phaseFiveContent.Contains('PHASE_5_RESERVATION_CONVERSION')) {
    throw 'Marker Fase 05 non trovato.'
}

Write-Step -Message 'Creazione pagamenti Stripe per prenotazioni'

$content_apps_api_src_reservations_dto_create_reservation_checkout_dto_ts = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { IsString, Length } from 'class-validator';

export class CreateReservationCheckoutDto {
  @IsString()
  @Length(8, 200)
  idempotencyKey!: string;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\dto\create-reservation-checkout.dto.ts') `
    -Content $content_apps_api_src_reservations_dto_create_reservation_checkout_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_payment_policy_ts = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export function buildReservationCheckoutRequestHash(input: {
  reservationId: string;
  amountCents: number;
  currency: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        reservationId: input.reservationId,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
      }),
    )
    .digest('hex');
}

export function assertReservationCheckoutAllowed(input: {
  status: string;
  amountCents: number;
  paymentExpiresAt: Date | null;
  now?: Date;
}): void {
  const now = input.now ?? new Date();

  if (input.amountCents <= 0) {
    throw new ConflictException({
      code: 'RESERVATION_PAYMENT_NOT_REQUIRED',
      message: 'Questa prenotazione non richiede un pagamento.',
    });
  }

  if (input.status !== 'PENDING_PAYMENT') {
    throw new ConflictException({
      code: 'RESERVATION_NOT_PENDING_PAYMENT',
      message: 'La prenotazione non è in attesa di pagamento.',
    });
  }

  if (
    !input.paymentExpiresAt ||
    input.paymentExpiresAt.getTime() <= now.getTime()
  ) {
    throw new ConflictException({
      code: 'RESERVATION_PAYMENT_EXPIRED',
      message: 'Il tempo disponibile per il pagamento è terminato.',
    });
  }
}

export function buildBookingReturnUrls(
  baseUrlInput: string,
  reservationToken: string,
): {
  successUrl: string;
  cancelUrl: string;
} {
  let baseUrl: URL;

  try {
    baseUrl = new URL(baseUrlInput);
  } catch {
    throw new BadRequestException({
      code: 'BOOKING_WEB_BASE_URL_INVALID',
      message: 'La configurazione del sito prenotazioni non è valida.',
    });
  }

  const success = new URL('/booking/success', baseUrl);
  success.searchParams.set('reservationToken', reservationToken);
  success.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');

  const cancel = new URL('/booking/cancel', baseUrl);
  cancel.searchParams.set('reservationToken', reservationToken);

  return {
    successUrl: success.toString().replace(
      '%7BCHECKOUT_SESSION_ID%7D',
      '{CHECKOUT_SESSION_ID}',
    ),
    cancelUrl: cancel.toString(),
  };
}

export function isLateReservationPayment(input: {
  reservationStatus: string;
  paymentExpiresAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  return (
    input.reservationStatus !== 'PENDING_PAYMENT' ||
    !input.paymentExpiresAt ||
    input.paymentExpiresAt.getTime() <= now.getTime()
  );
}

export function normalizeProviderFeeCents(
  providerFeeCents: number | null | undefined,
): number {
  if (
    providerFeeCents === null ||
    providerFeeCents === undefined ||
    !Number.isInteger(providerFeeCents) ||
    providerFeeCents < 0
  ) {
    return 0;
  }

  return providerFeeCents;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-payment-policy.ts') `
    -Content $content_apps_api_src_reservations_reservation_payment_policy_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_payment_policy_spec_ts = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { ConflictException } from '@nestjs/common';
import {
  assertReservationCheckoutAllowed,
  buildBookingReturnUrls,
  buildReservationCheckoutRequestHash,
  isLateReservationPayment,
  normalizeProviderFeeCents,
} from './reservation-payment-policy';

describe('reservation payment policy', () => {
  it('builds a stable checkout request hash', () => {
    const input = {
      reservationId: '286e849e-97f9-416a-b35c-068236f1f458',
      amountCents: 1_000,
      currency: 'eur',
    };

    expect(buildReservationCheckoutRequestHash(input)).toBe(
      buildReservationCheckoutRequestHash(input),
    );
  });

  it('allows a non-expired pending payment', () => {
    expect(() =>
      assertReservationCheckoutAllowed({
        status: 'PENDING_PAYMENT',
        amountCents: 1_000,
        paymentExpiresAt: new Date('2030-07-20T18:15:00.000Z'),
        now: new Date('2030-07-20T18:00:00.000Z'),
      }),
    ).not.toThrow();
  });

  it('rejects a confirmed reservation', () => {
    expect(() =>
      assertReservationCheckoutAllowed({
        status: 'CONFIRMED',
        amountCents: 1_000,
        paymentExpiresAt: null,
      }),
    ).toThrow(ConflictException);
  });

  it('builds server-controlled return URLs', () => {
    expect(
      buildBookingReturnUrls(
        'https://booking.example.com',
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toEqual({
      successUrl:
        'https://booking.example.com/booking/success?reservationToken=550e8400-e29b-41d4-a716-446655440000&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl:
        'https://booking.example.com/booking/cancel?reservationToken=550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('classifies an expired payment as late', () => {
    expect(
      isLateReservationPayment({
        reservationStatus: 'PENDING_PAYMENT',
        paymentExpiresAt: new Date('2030-07-20T18:00:00.000Z'),
        now: new Date('2030-07-20T18:00:01.000Z'),
      }),
    ).toBe(true);
  });

  it('normalizes an unavailable provider fee to zero', () => {
    expect(normalizeProviderFeeCents(undefined)).toBe(0);
    expect(normalizeProviderFeeCents(-1)).toBe(0);
    expect(normalizeProviderFeeCents(48)).toBe(48);
  });
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-payment-policy.spec.ts') `
    -Content $content_apps_api_src_reservations_reservation_payment_policy_spec_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_stripe_service_ts = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient, QueryResultRow } from 'pg';
import Stripe from 'stripe';
import { DatabaseService } from '@fluxa/database';
import type { CreateReservationCheckoutDto } from './dto/create-reservation-checkout.dto';
import {
  assertReservationCheckoutAllowed,
  buildBookingReturnUrls,
  buildReservationCheckoutRequestHash,
  isLateReservationPayment,
  normalizeProviderFeeCents,
} from './reservation-payment-policy';
import { hashPublicToken } from './reservation-policy';

interface CheckoutReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  confirmationCode: string;
  status: string;
  customerName: string;
  customerEmail: string;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  paymentExpiresAt: Date | null;
  eventTitle: string;
  eventSlug: string;
}

interface ReservationPaymentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  reservationId: string;
  status:
    | 'CREATED'
    | 'REQUIRES_ACTION'
    | 'PAID'
    | 'FAILED'
    | 'CANCELLED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED';
  provider: string;
  providerPaymentId: string | null;
  providerSessionId: string | null;
  providerEventId: string | null;
  idempotencyKey: string;
  requestHash: string;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  providerFeeCents: number;
  merchantNetCents: number;
  refundedCents: number;
  currency: string;
}

interface PaymentWebhookRow extends QueryResultRow {
  paymentId: string;
  organizationId: string;
  locationId: string;
  reservationId: string;
  eventId: string;
  paymentStatus: ReservationPaymentRow['status'];
  providerSessionId: string | null;
  providerPaymentId: string | null;
  providerEventId: string | null;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  reservationStatus: string;
  paymentExpiresAt: Date | null;
}

interface CheckoutPreparation {
  reservation: CheckoutReservationRow;
  payment: ReservationPaymentRow;
}

@Injectable()
export class ReservationStripeService {
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async createCheckout(
    reservationToken: string,
    dto: CreateReservationCheckoutDto,
  ) {
    const publicTokenHash = hashPublicToken(reservationToken);
    const idempotencyKey = dto.idempotencyKey.trim();

    const preparation = await this.prepareCheckout(
      publicTokenHash,
      idempotencyKey,
    );
    const stripe = this.stripe();

    if (preparation.payment.providerSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        preparation.payment.providerSessionId,
      );

      return this.checkoutView(preparation.payment.id, existingSession);
    }

    const urls = buildBookingReturnUrls(
      this.bookingWebBaseUrl(),
      reservationToken,
    );
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: preparation.reservation.customerEmail,
        client_reference_id: preparation.reservation.id,
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: preparation.reservation.currency.toLowerCase(),
              unit_amount: preparation.reservation.amountCents,
              product_data: {
                name: `Prenotazione ${preparation.reservation.eventTitle}`,
                description: `Codice ${preparation.reservation.confirmationCode}`,
              },
            },
          },
        ],
        metadata: {
          reservationId: preparation.reservation.id,
          reservationPaymentId: preparation.payment.id,
        },
        payment_intent_data: {
          metadata: {
            reservationId: preparation.reservation.id,
            reservationPaymentId: preparation.payment.id,
          },
        },
      },
      {
        idempotencyKey: `fluxa-reservation-payment-${preparation.payment.id}`,
      },
    );

    await this.attachCheckoutSession(
      preparation.payment.id,
      session,
      preparation.reservation,
    );

    return this.checkoutView(preparation.payment.id, session);
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): Stripe.Event {
    if (!signature) {
      throw new BadRequestException({
        code: 'STRIPE_SIGNATURE_MISSING',
        message: 'Firma Stripe mancante.',
      });
    }

    const webhookSecret =
      this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() ?? '';

    if (!webhookSecret) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook Stripe non configurato.',
      });
    }

    try {
      return this.stripe().webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException({
        code: 'STRIPE_SIGNATURE_INVALID',
        message: 'Firma Stripe non valida.',
      });
    }
  }

  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutPaid(
          event,
          event.data.object,
        );
        break;

      case 'checkout.session.expired':
        await this.handleCheckoutExpired(
          event,
          event.data.object,
        );
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(
          event,
          event.data.object,
        );
        break;

      default:
        break;
    }

    return { received: true };
  }

  private async prepareCheckout(
    publicTokenHash: string,
    idempotencyKey: string,
  ): Promise<CheckoutPreparation> {
    return this.withTransaction(async (client) => {
      const reservationResult =
        await client.query<CheckoutReservationRow>(
          `
            SELECT
              r.id,
              r.organization_id AS "organizationId",
              r.location_id AS "locationId",
              r.event_id AS "eventId",
              r.confirmation_code AS "confirmationCode",
              r.status,
              r.customer_name AS "customerName",
              r.customer_email AS "customerEmail",
              r.amount_cents AS "amountCents",
              r.platform_fee_cents AS "platformFeeCents",
              r.merchant_gross_cents AS "merchantGrossCents",
              r.currency,
              r.payment_expires_at AS "paymentExpiresAt",
              e.title AS "eventTitle",
              e.slug AS "eventSlug"
            FROM reservations r
            JOIN events e
              ON e.id = r.event_id
            WHERE r.public_token_hash = $1
            LIMIT 1
            FOR UPDATE OF r
          `,
          [publicTokenHash],
        );
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        throw new NotFoundException({
          code: 'RESERVATION_NOT_FOUND',
          message: 'Prenotazione non trovata.',
        });
      }

      assertReservationCheckoutAllowed({
        status: reservation.status,
        amountCents: reservation.amountCents,
        paymentExpiresAt: reservation.paymentExpiresAt,
      });

      const requestHash = buildReservationCheckoutRequestHash({
        reservationId: reservation.id,
        amountCents: reservation.amountCents,
        currency: reservation.currency,
      });

      const existingResult =
        await client.query<ReservationPaymentRow>(
          `
            SELECT
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              reservation_id AS "reservationId",
              status,
              provider,
              provider_payment_id AS "providerPaymentId",
              provider_session_id AS "providerSessionId",
              provider_event_id AS "providerEventId",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              amount_cents AS "amountCents",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              provider_fee_cents AS "providerFeeCents",
              merchant_net_cents AS "merchantNetCents",
              refunded_cents AS "refundedCents",
              currency
            FROM reservation_payments
            WHERE reservation_id = $1
              AND idempotency_key = $2
            LIMIT 1
            FOR UPDATE
          `,
          [reservation.id, idempotencyKey],
        );
      const existing = existingResult.rows[0];

      if (existing) {
        if (
          existing.requestHash !== requestHash ||
          existing.provider !== 'STRIPE'
        ) {
          throw new ConflictException({
            code: 'RESERVATION_PAYMENT_IDEMPOTENCY_REUSED',
            message:
              'La chiave di idempotenza è già stata utilizzata con dati differenti.',
          });
        }

        if (
          existing.status === 'PAID' ||
          existing.status === 'REFUNDED'
        ) {
          throw new ConflictException({
            code: 'RESERVATION_PAYMENT_ALREADY_COMPLETED',
            message: 'Il pagamento risulta già completato.',
          });
        }

        return { reservation, payment: existing };
      }

      const paymentId = randomUUID();
      const paymentResult =
        await client.query<ReservationPaymentRow>(
          `
            INSERT INTO reservation_payments (
              id,
              organization_id,
              location_id,
              reservation_id,
              status,
              provider,
              idempotency_key,
              request_hash,
              amount_cents,
              platform_fee_cents,
              merchant_gross_cents,
              provider_fee_cents,
              merchant_net_cents,
              refunded_cents,
              currency
            )
            VALUES (
              $1,$2,$3,$4,'CREATED','STRIPE',$5,$6,$7,$8,$9,0,$9,0,$10
            )
            RETURNING
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              reservation_id AS "reservationId",
              status,
              provider,
              provider_payment_id AS "providerPaymentId",
              provider_session_id AS "providerSessionId",
              provider_event_id AS "providerEventId",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              amount_cents AS "amountCents",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              provider_fee_cents AS "providerFeeCents",
              merchant_net_cents AS "merchantNetCents",
              refunded_cents AS "refundedCents",
              currency
          `,
          [
            paymentId,
            reservation.organizationId,
            reservation.locationId,
            reservation.id,
            idempotencyKey,
            requestHash,
            reservation.amountCents,
            reservation.platformFeeCents,
            reservation.merchantGrossCents,
            reservation.currency,
          ],
        );
      const payment = paymentResult.rows[0];

      if (!payment) {
        throw new Error('Reservation payment insert returned no row.');
      }

      return { reservation, payment };
    });
  }

  private async attachCheckoutSession(
    paymentId: string,
    session: Stripe.Checkout.Session,
    reservation: CheckoutReservationRow,
  ): Promise<void> {
    const providerPaymentId = this.stripeObjectId(
      session.payment_intent,
    );

    await this.withTransaction(async (client) => {
      const currentResult =
        await client.query<ReservationPaymentRow>(
          `
            SELECT
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              reservation_id AS "reservationId",
              status,
              provider,
              provider_payment_id AS "providerPaymentId",
              provider_session_id AS "providerSessionId",
              provider_event_id AS "providerEventId",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              amount_cents AS "amountCents",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              provider_fee_cents AS "providerFeeCents",
              merchant_net_cents AS "merchantNetCents",
              refunded_cents AS "refundedCents",
              currency
            FROM reservation_payments
            WHERE id = $1
            FOR UPDATE
          `,
          [paymentId],
        );
      const current = currentResult.rows[0];

      if (!current) {
        throw new NotFoundException({
          code: 'RESERVATION_PAYMENT_NOT_FOUND',
          message: 'Pagamento prenotazione non trovato.',
        });
      }

      if (
        current.providerSessionId &&
        current.providerSessionId !== session.id
      ) {
        throw new ConflictException({
          code: 'RESERVATION_PAYMENT_SESSION_CONFLICT',
          message:
            'Il pagamento è già collegato a una sessione differente.',
        });
      }

      const firstAttachment = !current.providerSessionId;

      await client.query(
        `
          UPDATE reservation_payments
          SET
            status = 'REQUIRES_ACTION',
            provider_session_id = $2,
            provider_payment_id = COALESCE($3, provider_payment_id),
            updated_at = NOW()
          WHERE id = $1
            AND status IN ('CREATED', 'REQUIRES_ACTION')
        `,
        [paymentId, session.id, providerPaymentId],
      );

      if (firstAttachment) {
        await this.recordChange(client, {
          organizationId: reservation.organizationId,
          action: 'reservation_payment.checkout_created',
          entityType: 'reservation_payment',
          entityId: paymentId,
          topic: 'reservations.payment.checkout_created',
          aggregateType: 'reservation_payment',
          aggregateId: paymentId,
          payload: {
            reservationPaymentId: paymentId,
            reservationId: reservation.id,
            eventId: reservation.eventId,
            locationId: reservation.locationId,
            provider: 'STRIPE',
            providerSessionId: session.id,
          },
        });
      }
    });
  }

  private async handleCheckoutPaid(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.payment_status !== 'paid') {
      return;
    }

    const paymentId =
      session.metadata?.reservationPaymentId?.trim() ?? '';

    if (!paymentId) {
      throw new BadRequestException({
        code: 'STRIPE_PAYMENT_METADATA_MISSING',
        message: 'Metadata pagamento Stripe mancante.',
      });
    }

    const paymentIntentId = this.stripeObjectId(
      session.payment_intent,
    );
    const paymentIntent = paymentIntentId
      ? await this.stripe().paymentIntents.retrieve(
          paymentIntentId,
          {
            expand: ['latest_charge.balance_transaction'],
          },
        )
      : null;
    const providerFeeCents = normalizeProviderFeeCents(
      this.providerFeeFromPaymentIntent(paymentIntent),
    );

    await this.withTransaction(async (client) => {
      const row = await this.lockWebhookPayment(
        client,
        paymentId,
      );

      if (!row) {
        throw new NotFoundException({
          code: 'RESERVATION_PAYMENT_NOT_FOUND',
          message: 'Pagamento prenotazione non trovato.',
        });
      }

      if (row.paymentStatus === 'PAID') {
        return;
      }

      const merchantNetCents =
        row.merchantGrossCents - providerFeeCents;
      const latePayment = isLateReservationPayment({
        reservationStatus: row.reservationStatus,
        paymentExpiresAt: row.paymentExpiresAt,
      });
      const nextReservationStatus = latePayment
        ? 'REFUND_PENDING'
        : 'CONFIRMED';

      await client.query(
        `
          UPDATE reservation_payments
          SET
            status = 'PAID',
            provider_session_id = $2,
            provider_payment_id = COALESCE($3, provider_payment_id),
            provider_event_id = $4,
            provider_fee_cents = $5,
            merchant_net_cents = $6,
            paid_at = NOW(),
            failure_code = NULL,
            failure_message = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          paymentId,
          session.id,
          paymentIntentId,
          event.id,
          providerFeeCents,
          merchantNetCents,
        ],
      );

      await client.query(
        `
          UPDATE reservations
          SET
            status = $2::reservation_status,
            provider_fee_cents = $3,
            merchant_net_cents = $4,
            payment_expires_at = NULL,
            confirmed_at = CASE
              WHEN $2 = 'CONFIRMED' THEN COALESCE(confirmed_at, NOW())
              ELSE confirmed_at
            END,
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.reservationId,
          nextReservationStatus,
          providerFeeCents,
          merchantNetCents,
        ],
      );

      if (latePayment) {
        await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              status = 'RELEASED',
              active_event_table_key = NULL,
              released_at = COALESCE(released_at, NOW()),
              release_reason = COALESCE(
                release_reason,
                'LATE_PAYMENT_REFUND_REQUIRED'
              ),
              version = version + 1,
              updated_at = NOW()
            WHERE reservation_id = $1
              AND status = 'ACTIVE'
          `,
          [row.reservationId],
        );
      }

      await client.query(
        `
          INSERT INTO reservation_status_history (
            id,
            organization_id,
            location_id,
            reservation_id,
            from_status,
            to_status,
            changed_by_user_id,
            reason,
            metadata
          )
          VALUES (
            $1,$2,$3,$4,$5::reservation_status,
            $6::reservation_status,NULL,$7,$8::jsonb
          )
        `,
        [
          randomUUID(),
          row.organizationId,
          row.locationId,
          row.reservationId,
          row.reservationStatus,
          nextReservationStatus,
          latePayment
            ? 'LATE_STRIPE_PAYMENT'
            : 'STRIPE_PAYMENT_SUCCEEDED',
          JSON.stringify({
            reservationPaymentId: paymentId,
            stripeEventId: event.id,
            providerSessionId: session.id,
            providerPaymentId: paymentIntentId,
          }),
        ],
      );

      await client.query(
        `
          INSERT INTO platform_fee_ledger (
            id,
            organization_id,
            location_id,
            event_id,
            reservation_id,
            reservation_payment_id,
            entry_type,
            source_key,
            customer_amount_cents,
            platform_fee_cents,
            provider_fee_cents,
            merchant_net_cents,
            currency,
            description
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,'CHARGE',$7,$8,$9,$10,$11,$12,$13
          )
          ON CONFLICT (source_key) DO NOTHING
        `,
        [
          randomUUID(),
          row.organizationId,
          row.locationId,
          row.eventId,
          row.reservationId,
          paymentId,
          `stripe:${event.id}:charge`,
          row.amountCents,
          row.platformFeeCents,
          providerFeeCents,
          merchantNetCents,
          row.currency,
          latePayment
            ? 'Pagamento Stripe tardivo: rimborso richiesto'
            : 'Pagamento prenotazione Stripe',
        ],
      );

      await this.recordChange(client, {
        organizationId: row.organizationId,
        action: latePayment
          ? 'reservation_payment.late_paid'
          : 'reservation_payment.paid',
        entityType: 'reservation_payment',
        entityId: paymentId,
        topic: latePayment
          ? 'reservations.payment.refund_required'
          : 'reservations.payment.paid',
        aggregateType: 'reservation',
        aggregateId: row.reservationId,
        payload: {
          reservationPaymentId: paymentId,
          reservationId: row.reservationId,
          eventId: row.eventId,
          locationId: row.locationId,
          provider: 'STRIPE',
          providerEventId: event.id,
          status: nextReservationStatus,
          providerFeeCents,
          merchantNetCents,
        },
      });
    });
  }

  private async handleCheckoutExpired(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const paymentId =
      session.metadata?.reservationPaymentId?.trim() ?? '';

    if (!paymentId) {
      return;
    }

    await this.markPaymentAttemptFailed({
      paymentId,
      providerEventId: event.id,
      providerPaymentId: this.stripeObjectId(
        session.payment_intent,
      ),
      status: 'CANCELLED',
      failureCode: 'CHECKOUT_SESSION_EXPIRED',
      failureMessage: 'La sessione Stripe è scaduta.',
    });
  }

  private async handlePaymentIntentFailed(
    event: Stripe.Event,
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const paymentId =
      paymentIntent.metadata?.reservationPaymentId?.trim() ?? '';

    if (!paymentId) {
      return;
    }

    await this.markPaymentAttemptFailed({
      paymentId,
      providerEventId: event.id,
      providerPaymentId: paymentIntent.id,
      status: 'FAILED',
      failureCode:
        paymentIntent.last_payment_error?.code ??
        'PAYMENT_INTENT_FAILED',
      failureMessage:
        paymentIntent.last_payment_error?.message ??
        'Pagamento Stripe non riuscito.',
    });
  }

  private async markPaymentAttemptFailed(input: {
    paymentId: string;
    providerEventId: string;
    providerPaymentId: string | null;
    status: 'FAILED' | 'CANCELLED';
    failureCode: string;
    failureMessage: string;
  }): Promise<void> {
    await this.withTransaction(async (client) => {
      const row = await this.lockWebhookPayment(
        client,
        input.paymentId,
      );

      if (!row || row.paymentStatus === 'PAID') {
        return;
      }

      if (row.providerEventId === input.providerEventId) {
        return;
      }

      await client.query(
        `
          UPDATE reservation_payments
          SET
            status = $2::reservation_payment_status,
            provider_payment_id = COALESCE($3, provider_payment_id),
            provider_event_id = $4,
            failure_code = $5,
            failure_message = $6,
            failed_at = CASE
              WHEN $2 = 'FAILED' THEN NOW()
              ELSE failed_at
            END,
            cancelled_at = CASE
              WHEN $2 = 'CANCELLED' THEN NOW()
              ELSE cancelled_at
            END,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          input.paymentId,
          input.status,
          input.providerPaymentId,
          input.providerEventId,
          input.failureCode.slice(0, 100),
          input.failureMessage.slice(0, 1000),
        ],
      );

      await this.recordChange(client, {
        organizationId: row.organizationId,
        action:
          input.status === 'FAILED'
            ? 'reservation_payment.failed'
            : 'reservation_payment.cancelled',
        entityType: 'reservation_payment',
        entityId: input.paymentId,
        topic:
          input.status === 'FAILED'
            ? 'reservations.payment.failed'
            : 'reservations.payment.cancelled',
        aggregateType: 'reservation_payment',
        aggregateId: input.paymentId,
        payload: {
          reservationPaymentId: input.paymentId,
          reservationId: row.reservationId,
          eventId: row.eventId,
          locationId: row.locationId,
          provider: 'STRIPE',
          providerEventId: input.providerEventId,
          failureCode: input.failureCode,
        },
      });
    });
  }

  private async lockWebhookPayment(
    client: PoolClient,
    paymentId: string,
  ): Promise<PaymentWebhookRow | null> {
    const result = await client.query<PaymentWebhookRow>(
      `
        SELECT
          rp.id AS "paymentId",
          rp.organization_id AS "organizationId",
          rp.location_id AS "locationId",
          rp.reservation_id AS "reservationId",
          r.event_id AS "eventId",
          rp.status AS "paymentStatus",
          rp.provider_session_id AS "providerSessionId",
          rp.provider_payment_id AS "providerPaymentId",
          rp.provider_event_id AS "providerEventId",
          rp.amount_cents AS "amountCents",
          rp.platform_fee_cents AS "platformFeeCents",
          rp.merchant_gross_cents AS "merchantGrossCents",
          rp.currency,
          r.status AS "reservationStatus",
          r.payment_expires_at AS "paymentExpiresAt"
        FROM reservation_payments rp
        JOIN reservations r
          ON r.id = rp.reservation_id
        WHERE rp.id = $1
          AND rp.provider = 'STRIPE'
        LIMIT 1
        FOR UPDATE OF rp, r
      `,
      [paymentId],
    );

    return result.rows[0] ?? null;
  }

  private providerFeeFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent | null,
  ): number | null {
    if (!paymentIntent) {
      return null;
    }

    const charge = paymentIntent.latest_charge;

    if (!charge || typeof charge === 'string') {
      return null;
    }

    const balanceTransaction = charge.balance_transaction;

    if (
      !balanceTransaction ||
      typeof balanceTransaction === 'string'
    ) {
      return null;
    }

    return balanceTransaction.fee;
  }

  private stripeObjectId(
    value: string | { id: string } | null,
  ): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  private checkoutView(
    paymentId: string,
    session: Stripe.Checkout.Session,
  ) {
    if (!session.url) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_CHECKOUT_URL_MISSING',
        message: 'Stripe non ha restituito un URL di checkout.',
      });
    }

    return {
      reservationPaymentId: paymentId,
      provider: 'STRIPE',
      providerSessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      checkoutUrl: session.url,
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  private stripe(): Stripe {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    const secretKey =
      this.config.get<string>('STRIPE_SECRET_KEY')?.trim() ?? '';

    if (!secretKey) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe non è configurato.',
      });
    }

    this.stripeClient = new Stripe(secretKey, {
      maxNetworkRetries: 2,
    });

    return this.stripeClient;
  }

  private bookingWebBaseUrl(): string {
    const value =
      this.config.get<string>('BOOKING_WEB_BASE_URL')?.trim() ?? '';

    if (!value) {
      throw new ServiceUnavailableException({
        code: 'BOOKING_WEB_NOT_CONFIGURED',
        message: 'Il sito prenotazioni non è configurato.',
      });
    }

    return value;
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      action: string;
      entityType: string;
      entityId: string;
      topic: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit_events (
          id,
          organization_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          payload
        )
        VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb)
      `,
      [
        randomUUID(),
        input.organizationId,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload),
      ],
    );

    await client.query(
      `
        INSERT INTO outbox_events (
          id,
          topic,
          aggregate_type,
          aggregate_id,
          payload
        )
        VALUES ($1,$2,$3,$4,$5::jsonb)
      `,
      [
        randomUUID(),
        input.topic,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify({
          organizationId: input.organizationId,
          ...input.payload,
        }),
      ],
    );
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-stripe.service.ts') `
    -Content $content_apps_api_src_reservations_reservation_stripe_service_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_stripe_controller_ts = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CreateReservationCheckoutDto } from './dto/create-reservation-checkout.dto';
import { ReservationStripeService } from './reservation-stripe.service';

@Public()
@Controller('public/reservations')
export class PublicReservationCheckoutController {
  constructor(
    private readonly stripePayments: ReservationStripeService,
  ) {}

  @Post(':reservationToken/checkout-sessions')
  createCheckout(
    @Param('reservationToken', new ParseUUIDPipe({ version: '4' }))
    reservationToken: string,
    @Body() dto: CreateReservationCheckoutDto,
  ) {
    return this.stripePayments.createCheckout(
      reservationToken,
      dto,
    );
  }
}

@Public()
@Controller('public/reservation-payments')
export class ReservationPaymentWebhookController {
  constructor(
    private readonly stripePayments: ReservationStripeService,
  ) {}

  @Post('stripe/webhook')
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException({
        code: 'STRIPE_RAW_BODY_MISSING',
        message: 'Corpo raw del webhook Stripe non disponibile.',
      });
    }

    const event = this.stripePayments.constructWebhookEvent(
      request.rawBody,
      signature,
    );

    return this.stripePayments.handleWebhook(event);
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-stripe.controller.ts') `
    -Content $content_apps_api_src_reservations_reservation_stripe_controller_ts `
    -DryRun:$DryRun

$content_scripts_verify_phase_6_stripe_reservation_payments_mjs = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/reservations/reservation-stripe.service.ts',
  'apps/api/src/reservations/reservation-stripe.controller.ts',
  'apps/api/src/reservations/reservation-payment-policy.ts',
  'apps/api/src/reservations/reservation-payment-policy.spec.ts',
  'apps/api/src/reservations/dto/create-reservation-checkout.dto.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const [
  packageJson,
  main,
  environment,
  environmentExample,
  controller,
  service,
  module,
] = await Promise.all([
  readFile(path.join(root, 'package.json'), 'utf8'),
  readFile(path.join(root, 'apps/api/src/main.ts'), 'utf8'),
  readFile(path.join(root, 'libs/config/src/environment.ts'), 'utf8'),
  readFile(path.join(root, '.env.example'), 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-stripe.controller.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-stripe.service.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservations.module.ts'),
    'utf8',
  ),
]);

const parsedPackage = JSON.parse(packageJson);
const stripeVersion = parsedPackage.dependencies?.stripe;

const checks = [
  ['Stripe dependency', String(stripeVersion), '22.3.2'],
  ['Nest raw body', main, 'rawBody: true'],
  ['Stripe secret config', environment, 'STRIPE_SECRET_KEY'],
  ['Stripe webhook config', environment, 'STRIPE_WEBHOOK_SECRET'],
  ['Booking web config', environment, 'BOOKING_WEB_BASE_URL'],
  ['Stripe env example', environmentExample, 'STRIPE_WEBHOOK_SECRET='],
  [
    'Checkout route',
    controller,
    "@Post(':reservationToken/checkout-sessions')",
  ],
  ['Webhook route', controller, "@Post('stripe/webhook')"],
  ['Raw body request', controller, 'RawBodyRequest<Request>'],
  [
    'Stripe signature verification',
    service,
    'webhooks.constructEvent',
  ],
  ['Stripe idempotency', service, 'idempotencyKey:'],
  [
    'Reservation payment insert',
    service,
    'INSERT INTO reservation_payments',
  ],
  ['Paid payment update', service, "status = 'PAID'"],
  ['Reservation confirmation', service, "'CONFIRMED'"],
  ['Late payment protection', service, "'REFUND_PENDING'"],
  ['Fee ledger', service, 'INSERT INTO platform_fee_ledger'],
  ['Status history', service, 'INSERT INTO reservation_status_history'],
  ['Audit', service, 'INSERT INTO audit_events'],
  ['Outbox', service, 'INSERT INTO outbox_events'],
  [
    'Stripe service provider',
    module,
    'ReservationStripeService',
  ],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 06 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File nuovi verificati: ${requiredFiles.length}`);
console.log(`Stripe SDK: ${stripeVersion}`);
console.log('Checkout pubblico e webhook firmato: presenti');
console.log('Conferma, late payment e ledger: presenti');
console.log('Dominio pagamenti POS: separato');
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\verify-phase-6-stripe-reservation-payments.mjs') `
    -Content $content_scripts_verify_phase_6_stripe_reservation_payments_mjs `
    -DryRun:$DryRun

$content_docs_phase_2_stripe_reservation_payments_md = @'
# Fluxa Phase 2 — Stripe reservation payments

## Obiettivo

La Fase 06 collega le prenotazioni online a Stripe Checkout senza utilizzare
il dominio dei pagamenti POS.

## Endpoint

```text
POST /api/v1/public/reservations/:reservationToken/checkout-sessions
POST /api/v1/public/reservation-payments/stripe/webhook
```

Creazione checkout:

```json
{
  "idempotencyKey": "chiave stabile del tentativo"
}
```

Gli URL di ritorno vengono costruiti dal backend usando
`BOOKING_WEB_BASE_URL`; non vengono accettati URL arbitrari dal client.

## Configurazione

```text
BOOKING_WEB_BASE_URL=https://booking.example.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

In locale possono essere usate chiavi test Stripe.

## Idempotenza distribuita

Il backend:

1. crea o recupera `reservation_payments`;
2. salva una chiave di idempotenza per prenotazione;
3. usa l’ID locale del pagamento come idempotency key Stripe;
4. collega la Checkout Session alla riga locale;
5. restituisce la stessa sessione nei retry successivi.

Un crash dopo la chiamata Stripe non crea un secondo addebito perché il retry
riutilizza la stessa chiave provider.

## Webhook

La firma viene verificata sul raw body.

Eventi gestiti:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
payment_intent.payment_failed
```

Un pagamento riuscito:

- imposta `reservation_payments.status = PAID`;
- registra la commissione provider disponibile;
- conferma la prenotazione;
- azzera `payment_expires_at`;
- registra storico, audit, outbox e ledger.

## Pagamento tardivo

Un pagamento ricevuto dopo la scadenza o dopo il rilascio della prenotazione
non ricrea automaticamente il tavolo.

La prenotazione passa a:

```text
REFUND_PENDING
```

e viene pubblicato:

```text
reservations.payment.refund_required
```

Il rimborso automatico verrà gestito nella fase dedicata.

## Separazione POS

Non vengono modificati:

```text
apps/api/src/payments
payment_transactions
checkout_sessions
payment_events
```

I pagamenti delle prenotazioni usano esclusivamente:

```text
reservation_payments
platform_fee_ledger
```

## Migrazioni

La fase non genera nuove migrazioni. Usa le strutture create nelle Fasi 02 e
05.
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\stripe-reservation-payments.md') `
    -Content $content_docs_phase_2_stripe_reservation_payments_md `
    -DryRun:$DryRun

$reservationsModuleContent = @'
// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { Module } from '@nestjs/common';
import {
  PublicEventReservationsController,
  PublicReservationHoldsController,
  PublicReservationsController,
} from './public-reservations.controller';
import { ReservationConversionService } from './reservation-conversion.service';
import { ReservationEngineService } from './reservation-engine.service';
import {
  PublicReservationCheckoutController,
  ReservationPaymentWebhookController,
} from './reservation-stripe.controller';
import { ReservationStripeService } from './reservation-stripe.service';

@Module({
  controllers: [
    PublicEventReservationsController,
    PublicReservationHoldsController,
    PublicReservationsController,
    PublicReservationCheckoutController,
    ReservationPaymentWebhookController,
  ],
  providers: [
    ReservationEngineService,
    ReservationConversionService,
    ReservationStripeService,
  ],
  exports: [
    ReservationEngineService,
    ReservationConversionService,
    ReservationStripeService,
  ],
})
export class ReservationsModule {}
'@

Write-ExpectedPhaseFile `
    -Path $reservationsModulePath `
    -Content $reservationsModuleContent `
    -RequiredMarker 'PHASE_5_RESERVATION_CONVERSION' `
    -DryRun:$DryRun

Enable-RawBody `
    -Path $mainPath `
    -DryRun:$DryRun

Update-EnvironmentSchema `
    -Path $environmentPath `
    -DryRun:$DryRun

Update-EnvironmentSpec `
    -Path $environmentSpecPath `
    -DryRun:$DryRun

Update-EnvironmentExample `
    -Path $environmentExamplePath `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 06 completato'

    Write-Host @"
Verrebbero aggiunti:

- Stripe SDK 22.3.2;
- Checkout Session pubblica e idempotente;
- webhook Stripe con verifica firma sul raw body;
- conferma reservation dopo pagamento;
- provider fee e platform fee ledger;
- gestione failure e checkout scaduto;
- protezione dei pagamenti tardivi con REFUND_PENDING;
- configurazione Stripe e booking web;
- nessuna modifica al dominio pagamenti POS;
- nessuna nuova migrazione.
"@

    return
}

Write-Step -Message 'Installazione Stripe SDK'

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @(
        'install',
        'stripe@22.3.2',
        '--save-exact'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Formattazione Fase 06'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'package.json',
        'apps/api/src/main.ts',
        'apps/api/src/reservations/**/*.ts',
        'libs/config/src/environment.ts',
        'libs/config/src/environment.spec.ts',
        '.env.example',
        'scripts/verify-phase-6-stripe-reservation-payments.mjs',
        'docs/phase-2/stripe-reservation-payments.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica strutturale Fase 06'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @(
        'scripts/verify-phase-6-stripe-reservation-payments.mjs'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Assert-NoPosPaymentChanges -RepositoryRoot $repositoryRoot

if (-not $SkipVerify) {
    Write-Step -Message 'Lint backend'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'lint') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Test policy pagamenti reservation'

    Invoke-Checked `
        -FilePath $npxCommand `
        -ArgumentList @(
            'jest',
            '--runInBand',
            '--runTestsByPath',
            'apps/api/src/reservations/reservation-payment-policy.spec.ts',
            '--roots',
            'apps/api/src/reservations'
        ) `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Test configurazione ambiente'

    Invoke-Checked `
        -FilePath $npxCommand `
        -ArgumentList @(
            'jest',
            '--runInBand',
            '--runTestsByPath',
            'libs/config/src/environment.spec.ts',
            '--roots',
            'libs/config/src'
        ) `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Build API e worker'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'build') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }
}

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot
Assert-NoPosPaymentChanges -RepositoryRoot $repositoryRoot
Show-GitDiffSummary -RepositoryRoot $repositoryRoot

Write-Step -Message 'Fase 06 completata'

Write-Host @"
Pagamenti Stripe per le prenotazioni creati.

Non sono state generate o applicate migrazioni.

Prima dell'avvio locale configura in .env:

BOOKING_WEB_BASE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

Controlli finali:

git status --short
git diff --check
git diff --stat
"@
