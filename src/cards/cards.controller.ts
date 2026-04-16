import { Controller, Get, Post, Body, Param, UseGuards, Request, Patch, Delete } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
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

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.cardsService.remove(req.user.id, id);
  }
}
