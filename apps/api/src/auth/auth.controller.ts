import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentAuth } from './decorators/current-auth.decorator';
import { Public } from './decorators/public.decorator';
import { TenantOptional } from './decorators/tenant-optional.decorator';
import type { AuthContext } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, this.requestMetadata(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    return this.authService.refresh(
      dto.refreshToken,
      this.requestMetadata(request),
    );
  }

  @TenantOptional()
  @Post('switch-organization')
  @HttpCode(200)
  switchOrganization(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SwitchOrganizationDto,
    @Req() request: Request,
  ) {
    return this.authService.switchOrganization(
      auth,
      dto,
      this.requestMetadata(request),
    );
  }

  @TenantOptional()
  @Post('logout')
  @HttpCode(200)
  logout(@CurrentAuth() auth: AuthContext) {
    return this.authService.logout(auth);
  }

  @TenantOptional()
  @Post('logout-all')
  @HttpCode(200)
  logoutAll(@CurrentAuth() auth: AuthContext) {
    return this.authService.logoutAll(auth);
  }

  @TenantOptional()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.authService.me(auth);
  }

  private requestMetadata(request: Request) {
    return {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
