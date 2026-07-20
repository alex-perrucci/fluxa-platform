import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from '@fluxa/config';
import { DatabaseModule } from '@fluxa/database';
import { QueueModule } from '@fluxa/queue';
import { AuthModule } from './auth/auth.module';
import { AuthorizationGuard } from './auth/guards/authorization.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantContextGuard } from './auth/guards/tenant-context.guard';
import { CatalogModule } from './catalog/catalog.module';
import { DevicesModule } from './devices/devices.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { HealthModule } from './health/health.module';
import { HospitalityModule } from './hospitality/hospitality.module';
import { LocationsModule } from './locations/locations.module';
import { MerchantsModule } from './merchants/merchants.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PaymentsModule } from './payments/payments.module';
import { PrintingModule } from './printing/printing.module';
import { RootController } from './root.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (request) =>
          request.headers['x-request-id']?.toString() ?? randomUUID(),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.temporaryPassword',
            'req.body.refreshToken',
            'res.headers.set-cookie',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    DatabaseModule,
    QueueModule,
    AuthModule,
    HealthModule,
    FiscalModule,
    HospitalityModule,
    OrdersModule,
    OrganizationsModule,
    PaymentsModule,
    PrintingModule,
    MerchantsModule,
    LocationsModule,
    CatalogModule,
    DevicesModule,
  ],
  controllers: [RootController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthorizationGuard,
    },
  ],
})
export class AppModule {}
