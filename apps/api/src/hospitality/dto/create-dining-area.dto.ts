import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateDiningAreaDto {
  @IsString() @Length(1, 40) @Matches(/^[A-Z0-9_.-]+$/i) code!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}
