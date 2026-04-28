import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction } from './transaction.schema';
import { Card } from '../cards/schemas/card.schema';
import { UsersService } from '../users/users.service';
import { CurrencyService } from '../currency/currency.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(Card.name) private cardModel: Model<Card>,
    private usersService: UsersService,
    private currencyService: CurrencyService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  async recharge(userId: string, amount: number, currency: string, description: string): Promise<Transaction> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const targetCurrency = user.currency || 'USD';
    const amountInUserCurrency = await this.currencyService.convertFiat(amount, currency, targetCurrency);
    const rate = await this.currencyService.getFiatRate(currency, targetCurrency);

    const transactionData: any = {
      userId: new Types.ObjectId(userId),
      type: 'TOPUP',
      amount: amountInUserCurrency,
      description,
      status: 'SUCCESS',
      category: 'Recharge',
      originalAmount: amount,
      originalCurrency: currency.toUpperCase(),
      targetAmount: amountInUserCurrency,
      targetCurrency: targetCurrency,
      exchangeRate: rate,
    };

    if (user.defaultCardId) {
      const card = await this.cardModel.findById(user.defaultCardId);
      if (card && (card.cardBalance + amountInUserCurrency) <= card.limitValue) {
        transactionData.toCardId = user.defaultCardId;
        await this.cardModel.findByIdAndUpdate(user.defaultCardId, { $inc: { cardBalance: amountInUserCurrency } });
      } else {
        await this.usersService.updateBalance(userId, amountInUserCurrency);
      }
    } else {
      await this.usersService.updateBalance(userId, amountInUserCurrency);
    }

    const transaction = new this.transactionModel(transactionData);
    await transaction.save();

    this.notificationsGateway.sendNotification(userId, {
      type: 'TOPUP',
      title: 'Compte Rechargé',
      message: `Vous avez reçu ${amountInUserCurrency.toFixed(2)} ${targetCurrency} !`,
      amount: amountInUserCurrency
    });

    return transaction;
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
      throw new BadRequestException(`Solde insuffisant. Vous avez ${sender.balance?.toFixed(2)} ${sender.currency}`);
    }

    const recipient = await this.usersService.findByEmail(recipientEmail);
    if (!recipient) throw new NotFoundException(`Aucun compte trouvé pour ${recipientEmail}`);
    if (recipient._id.toString() === senderId) {
      throw new BadRequestException("Impossible de vous envoyer de l'argent à vous-même");
    }

    const senderCurrency = sender.currency || 'USD';
    const recipientCurrency = recipient.currency || 'USD';
    
    // Conversion directe Fiat-to-Fiat
    const targetAmount = await this.currencyService.convertFiat(amount, senderCurrency, recipientCurrency);
    const rate = await this.currencyService.getFiatRate(senderCurrency, recipientCurrency);

    const desc = note || `Transfert à ${recipient.fullName}`;
    const descRecipient = note || `Reçu de ${sender.fullName}`;

    // 1. Débiter l'expéditeur
    await this.usersService.updateBalance(senderId, -amount);

    // 2. Créditer le destinataire (avec conversion)
    const creditData: any = {
      userId: recipient._id,
      type: 'TRANSFER_IN',
      amount: targetAmount,
      description: descRecipient,
      status: 'SUCCESS',
      category: 'Transfert',
      senderId: new Types.ObjectId(senderId),
      originalAmount: amount,
      originalCurrency: senderCurrency,
      targetAmount: targetAmount,
      targetCurrency: recipientCurrency,
      exchangeRate: rate
    };

    if (recipient.defaultCardId) {
      const card = await this.cardModel.findById(recipient.defaultCardId);
      if (card && (card.cardBalance + targetAmount) <= card.limitValue) {
        creditData.toCardId = recipient.defaultCardId;
        await this.cardModel.findByIdAndUpdate(recipient.defaultCardId, { $inc: { cardBalance: targetAmount } });
      } else {
        await this.usersService.updateBalance(recipient._id.toString(), targetAmount);
      }
    } else {
      await this.usersService.updateBalance(recipient._id.toString(), targetAmount);
    }

    const debit = new this.transactionModel({
      userId: new Types.ObjectId(senderId),
      type: 'TRANSFER_OUT',
      amount: amount,
      description: desc,
      status: 'SUCCESS',
      category: 'Transfert',
      recipientId: recipient._id,
      originalAmount: amount,
      originalCurrency: senderCurrency,
      targetAmount: targetAmount,
      targetCurrency: recipientCurrency,
      exchangeRate: rate
    });

    const credit = new this.transactionModel(creditData);

    await debit.save();
    await credit.save();

    this.notificationsGateway.sendNotification(recipient._id.toString(), {
      type: 'TRANSFER_IN',
      title: 'Transfert Reçu',
      message: `${sender.fullName} vous a envoyé ${targetAmount.toFixed(2)} ${recipientCurrency} !`,
      amount: targetAmount
    });

    return { debit, credit };
  }

  async findAllByUser(userId: string): Promise<Transaction[]> {
    return this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }
}
