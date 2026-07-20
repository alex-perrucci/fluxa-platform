import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthorizationGuard } from './guards/authorization.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantContextGuard } from './guards/tenant-context.guard';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    TenantContextGuard,
    AuthorizationGuard,
  ],
  exports: [AuthService, JwtAuthGuard, TenantContextGuard, AuthorizationGuard],
})
export class AuthModule {}
