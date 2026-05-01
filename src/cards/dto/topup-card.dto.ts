import { IsNumber, IsNotEmpty, Min } from 'class-validator';

export class TopupCardDto {
  @IsNumber({}, { message: 'Le montant doit être un nombre' })
  @IsNotEmpty({ message: 'Le montant est requis' })
  @Min(1, { message: 'Le montant minimum est de 1' })
  amount: number;
}
