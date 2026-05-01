import { IsNotEmpty, IsEnum } from 'class-validator';

export class CreateCardDto {
  @IsNotEmpty({ message: 'Le type de carte est requis' })
  @IsEnum(['STANDARD', 'PREMIUM', 'VIP MEMBER'], { message: 'Type de carte invalide' })
  type: string;
}
