import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction } from './transaction.schema';
import { UsersService } from '../users/users.service';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    private usersService: UsersService,
    private currencyService: CurrencyService,
  ) {}

  async recharge(userId: string, amount: number, currency: string, description: string): Promise<Transaction> {
    const amountInUsd = this.currencyService.convert(amount, currency, 'USD');
    const rate = this.currencyService.getRate(currency);

    // Create transaction
    const transaction = new this.transactionModel({
      userId: new Types.ObjectId(userId),
      type: 'TOPUP',
      amount: amountInUsd,
      description,
      status: 'SUCCESS',
      category: 'Recharge',
      originalAmount: amount,
      originalCurrency: currency.toUpperCase(),
      exchangeRate: rate,
    });

    // Update user balance (always in USD internally)
    await this.usersService.updateBalance(userId, amountInUsd);

    return transaction.save();
  }

  async findAllByUser(userId: string): Promise<Transaction[]> {
    return this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }
}
