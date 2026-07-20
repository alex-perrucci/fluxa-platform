import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext, AuthenticatedRequest } from '../auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.auth;
  },
);
