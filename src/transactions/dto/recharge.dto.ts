import { IsNumber, IsString, IsNotEmpty, Min, IsEnum } from 'class-validator';

export class RechargeDto {
  @IsNumber({}, { message: 'Le montant doit être un nombre' })
  @IsNotEmpty({ message: 'Le montant est requis' })
  @Min(5, { message: 'Le montant minimum est de 5' })
  amount: number;

  @IsString({ message: 'La devise doit être une chaîne' })
  @IsNotEmpty({ message: 'La devise est requise' })
  currency: string;

  @IsString({ message: 'La description doit être une chaîne' })
  @IsNotEmpty({ message: 'La description est requise' })
  description: string;
}
