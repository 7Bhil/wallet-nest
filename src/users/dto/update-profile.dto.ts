import { IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'Le nom doit être une chaîne' })
  @IsOptional()
  @MaxLength(50, { message: 'Le nom est trop long' })
  fullName?: string;

  @IsString({ message: 'La devise doit être une chaîne' })
  @IsOptional()
  @IsEnum(['USD', 'EUR', 'GBP', 'XOF', 'BSD'], { message: 'Devise non supportée' })
  currency?: string;
}
