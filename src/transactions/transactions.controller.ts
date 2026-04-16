import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post('recharge')
  async recharge(
    @Request() req: any,
    @Body() body: { amount: number; currency: string; description: string }
  ) {
    return this.transactionsService.recharge(req.user.id, body.amount, body.currency, body.description);
  }

  @Post('transfer')
  async transfer(
    @Request() req: any,
    @Body() body: { recipientEmail: string; amount: number; note?: string }
  ) {
    return this.transactionsService.transfer(req.user.id, body.recipientEmail, body.amount, body.note || '');
  }

  @Get('my')
  async getMyTransactions(@Request() req: any) {
    return this.transactionsService.findAllByUser(req.user.id);
  }
}
