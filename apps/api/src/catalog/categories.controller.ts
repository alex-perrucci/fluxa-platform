import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: CatalogListQueryDto) {
    return this.categoriesService.list(auth, query);
  }

  @Get(':categoryId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.categoriesService.get(auth, categoryId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':categoryId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(auth, categoryId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':categoryId')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.categoriesService.archive(auth, categoryId);
  }
}
