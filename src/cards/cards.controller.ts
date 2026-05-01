import { Controller, Get, Post, Body, Param, UseGuards, Request, Patch, Delete } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { TopupCardDto } from './dto/topup-card.dto';
import { CardTransferDto } from './dto/card-transfer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  create(@Request() req: any, @Body() createCardDto: CreateCardDto) {
    return this.cardsService.create(req.user.id, createCardDto);
  }

  @Get('my')
  findAll(@Request() req: any) {
    return this.cardsService.findAllByUserId(req.user.id);
  }

  @Patch(':id/freeze')
  freeze(@Request() req: any, @Param('id') id: string) {
    return this.cardsService.freezeCard(req.user.id, id);
  }

  @Patch(':id/default')
  setDefault(@Request() req: any, @Param('id') id: string) {
    return this.cardsService.setDefault(req.user.id, id);
  }

  @Post(':id/topup')
  topupCard(
    @Request() req: any,
    @Param('id') id: string,
    @Body() topupCardDto: TopupCardDto
  ) {
    return this.cardsService.topupCard(req.user.id, id, topupCardDto.amount);
  }

  @Post('transfer')
  cardTransfer(
    @Request() req: any,
    @Body() cardTransferDto: CardTransferDto
  ) {
    return this.cardsService.cardTransfer(
      req.user.id, 
      cardTransferDto.fromCardId, 
      cardTransferDto.toCardId, 
      cardTransferDto.amount
    );
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.cardsService.remove(req.user.id, id);
  }
}
