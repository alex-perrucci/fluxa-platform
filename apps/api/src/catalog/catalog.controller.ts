import { Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { CatalogQueryService } from './catalog-query.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogQueryService: CatalogQueryService) {}

  @Get()
  forLocation(
    @CurrentAuth() auth: AuthContext,
    @Query() query: CatalogQueryDto,
  ) {
    return this.catalogQueryService.forLocation(auth, query);
  }
}
