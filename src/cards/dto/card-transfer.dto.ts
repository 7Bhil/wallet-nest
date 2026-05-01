import { IsNumber, IsNotEmpty, Min, IsString } from 'class-validator';

export class CardTransferDto {
  @IsString({ message: 'ID de carte source invalide' })
  @IsNotEmpty({ message: 'La carte source est requise' })
  fromCardId: string;

  @IsString({ message: 'ID de carte destination invalide' })
  @IsNotEmpty({ message: 'La carte destination est requise' })
  toCardId: string;

  @IsNumber({}, { message: 'Le montant doit être un nombre' })
  @IsNotEmpty({ message: 'Le montant est requis' })
  @Min(1, { message: 'Le montant minimum est de 1' })
  amount: number;
}
