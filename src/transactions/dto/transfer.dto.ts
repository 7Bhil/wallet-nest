import { IsNumber, IsString, IsNotEmpty, Min, IsEmail, IsOptional } from 'class-validator';

export class TransferDto {
  @IsEmail({}, { message: 'Format d\'email du destinataire invalide' })
  @IsNotEmpty({ message: 'L\'email du destinataire est requis' })
  recipientEmail: string;

  @IsNumber({}, { message: 'Le montant doit être un nombre' })
  @IsNotEmpty({ message: 'Le montant est requis' })
  @Min(1, { message: 'Le transfert minimum est de 1' })
  amount: number;

  @IsString({ message: 'La note doit être une chaîne' })
  @IsOptional()
  note?: string;
}
