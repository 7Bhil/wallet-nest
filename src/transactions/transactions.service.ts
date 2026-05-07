import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Transaction } from './transaction.schema';
import { Card } from '../cards/schemas/card.schema';
import { UsersService } from '../users/users.service';
import { CurrencyService } from '../currency/currency.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AdminService } from '../admin/admin.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(Card.name) private cardModel: Model<Card>,
    @InjectConnection() private readonly connection: Connection,
    private usersService: UsersService,
    private currencyService: CurrencyService,
    private notificationsGateway: NotificationsGateway,
    private adminService: AdminService,
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

    // FIX Faille 3 : Sécurisation du endpoint de recharge
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Topup désactivé en production - Requiert une passerelle de paiement réelle (Stripe/HMAC)');
    }

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
    
    const senderCards = await this.cardModel.countDocuments({ userId: senderId });
    if (senderCards === 0) {
      throw new BadRequestException('Vous devez posséder au moins une carte virtuelle active pour effectuer des transferts.');
    }

    const recipient = await this.usersService.findByEmail(recipientEmail);
    if (!recipient) throw new NotFoundException(`Aucun compte trouvé pour ${recipientEmail}`);
    if (recipient._id.toString() === senderId) {
      throw new BadRequestException("Impossible de vous envoyer de l'argent à vous-même");
    }

    const senderCurrency = sender.currency || 'USD';
    const recipientCurrency = recipient.currency || 'USD';
    
    const targetAmount = await this.currencyService.convertFiat(amount, senderCurrency, recipientCurrency);
    const rate = await this.currencyService.getFiatRate(senderCurrency, recipientCurrency);
    const exactAmount = await this.currencyService.convertExact(amount, senderCurrency, recipientCurrency);
    const spreadFee = Math.max(0, exactAmount - targetAmount);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Débiter l'expéditeur atomiquement (Race Condition & Atomicity)
      const updatedSender = await this.usersService.deductBalanceSafe(senderId, amount, session);
      if (!updatedSender) {
        throw new BadRequestException('Solde insuffisant ou erreur de transaction simultanée');
      }

      // 2. Récupérer les frais plateforme
      if (spreadFee > 0) {
        // Optionnel: Passer la session ici aussi si adminService le supportait
        await this.adminService.collectSystemFee(spreadFee, recipientCurrency, `Commission Transfert de ${sender.fullName}`);
      }

      const desc = note || `Transfert à ${recipient.fullName}`;
      const descRecipient = note || `Reçu de ${sender.fullName}`;

      // 3. Créditer le destinataire
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
        // FIX LOGIQUE : On ne crédite la carte que si elle est ACTIVE.
        if (card && card.status === 'ACTIVE' && (card.cardBalance + targetAmount) <= card.limitValue) {
          creditData.toCardId = recipient.defaultCardId;
          await this.cardModel.findByIdAndUpdate(recipient.defaultCardId, { $inc: { cardBalance: targetAmount } }, { session });
        } else {
          await this.usersService.updateBalance(recipient._id.toString(), targetAmount, session);
        }
      } else {
        await this.usersService.updateBalance(recipient._id.toString(), targetAmount, session);
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

      await debit.save({ session });
      await credit.save({ session });

      await session.commitTransaction();
      
      this.notificationsGateway.sendNotification(recipient._id.toString(), {
        type: 'TRANSFER_IN',
        title: 'Transfert Reçu',
        message: `${sender.fullName} vous a envoyé ${targetAmount.toFixed(2)} ${recipientCurrency} !`,
        amount: targetAmount
      });

      return { debit, credit };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAllByUser(userId: string): Promise<Transaction[]> {
    return this.transactionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }
}
