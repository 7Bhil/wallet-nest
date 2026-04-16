import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction } from './transaction.schema';
import { Card } from '../cards/schemas/card.schema';
import { UsersService } from '../users/users.service';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(Card.name) private cardModel: Model<Card>,
    private usersService: UsersService,
    private currencyService: CurrencyService,
  ) {}

  async recharge(userId: string, amount: number, currency: string, description: string): Promise<Transaction> {
    const amountInBSD = this.currencyService.convert(amount, currency, 'BSD');
    const rate = this.currencyService.getRate(currency);
    const user = await this.usersService.findById(userId);

    const transactionData: any = {
      userId: new Types.ObjectId(userId),
      type: 'TOPUP',
      amount: amountInBSD,
      description,
      status: 'SUCCESS',
      category: 'Recharge',
      originalAmount: amount,
      originalCurrency: currency.toUpperCase(),
      exchangeRate: rate,
    };

    if (user?.defaultCardId) {
      transactionData.toCardId = user.defaultCardId;
      await this.cardModel.findByIdAndUpdate(user.defaultCardId, { $inc: { cardBalance: amountInBSD } });
    } else {
      await this.usersService.updateBalance(userId, amountInBSD);
    }

    const transaction = new this.transactionModel(transactionData);
    return transaction.save();
  }

  async transfer(
    senderId: string,
    recipientEmail: string,
    amount: number,
    note: string,
  ): Promise<{ debit: Transaction; credit: Transaction }> {
    if (amount <= 0) throw new BadRequestException('Le montant doit être positif');

    const sender = await this.usersService.findById(senderId);
    if (!sender) throw new NotFoundException('Expéditeur introuvable');
    if ((sender.balance || 0) < amount) {
      throw new BadRequestException(`Solde insuffisant. Vous avez B$ ${sender.balance?.toFixed(2)}`);
    }

    const recipient = await this.usersService.findByEmail(recipientEmail);
    if (!recipient) throw new NotFoundException(`Aucun compte trouvé pour ${recipientEmail}`);
    if (recipient._id.toString() === senderId) {
      throw new BadRequestException("Impossible de vous envoyer de l'argent à vous-même");
    }

    const desc = note || `Transfert à ${recipient.fullName}`;
    const descRecipient = note || `Reçu de ${sender.fullName}`;

    const creditData: any = {
      userId: recipient._id,
      type: 'TRANSFER_IN',
      amount,
      description: descRecipient,
      status: 'SUCCESS',
      category: 'Transfert',
      senderId: new Types.ObjectId(senderId),
    };

    await this.usersService.updateBalance(senderId, -amount);

    if (recipient.defaultCardId) {
      creditData.toCardId = recipient.defaultCardId;
      await this.cardModel.findByIdAndUpdate(recipient.defaultCardId, { $inc: { cardBalance: amount } });
    } else {
      await this.usersService.updateBalance(recipient._id.toString(), amount);
    }

    const debit = new this.transactionModel({
      userId: new Types.ObjectId(senderId),
      type: 'TRANSFER_OUT',
      amount,
      description: desc,
      status: 'SUCCESS',
      category: 'Transfert',
      recipientId: recipient._id,
    });

    const credit = new this.transactionModel(creditData);

    await debit.save();
    await credit.save();

    return { debit, credit };
  }

  async findAllByUser(userId: string): Promise<Transaction[]> {
    return this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }
}
