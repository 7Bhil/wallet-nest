import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RechargeDto } from './dto/recharge.dto';
import { TransferDto } from './dto/transfer.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post('recharge')
  async recharge(@Request() req: any, @Body() rechargeDto: RechargeDto) {
    return this.transactionsService.recharge(
      req.user.id,
      rechargeDto.amount,
      rechargeDto.currency,
      rechargeDto.description,
    );
  }

  @Post('recharge/verify')
  async verifyKkiapay(
    @Request() req: any,
    @Body() body: { transactionId: string; amount: number; currency: string },
  ) {
    return this.transactionsService.verifyKkiapay(
      req.user.id,
      body.transactionId,
      body.amount,
      body.currency,
    );
  }

  @Post('transfer')
  async transfer(@Request() req: any, @Body() transferDto: TransferDto) {
    return this.transactionsService.transfer(
      req.user.id,
      transferDto.recipientEmail,
      transferDto.amount,
      transferDto.note || '',
    );
  }

  @Get('my')
  async getMyTransactions(@Request() req: any) {
    return this.transactionsService.findAllByUser(req.user.id);
  }
}
