import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User } from '../users/user.schema';
import { Transaction } from '../transactions/transaction.schema';
import { Card } from '../cards/schemas/card.schema';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(Card.name) private cardModel: Model<Card>,
    private currencyService: CurrencyService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async processPlatformNightlyFees() {
    console.log('[Treasury] Démarrage de la collecte des frais de la plateforme...');
    
    // 1. Frais de Gestion des Cartes (Daily Maintenance Fee)
    const activeCards = await this.cardModel.find({ cardBalance: { $gt: 0 }, status: 'ACTIVE' }).exec();
    for (const card of activeCards) {
      const user = await this.userModel.findById(card.userId).exec();
      if (!user) continue;

      const dailyRate = (card.interestRate || 0) / 100 / 365;
      const feeAmount = card.cardBalance * dailyRate;

      if (feeAmount > 0.01) { // On évite les micro-centimes abusifs
        card.cardBalance -= feeAmount;
        await card.save();
        await this.collectSystemFee(feeAmount, user.currency || 'USD', `Frais de gestion journaliers (${card.name}) pour ${user.fullName}`);
      }
    }

    // 2. Frais d'Inactivité (1 B$ par mois si aucune trx depuis 90 jours)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const staleUsers = await this.userModel.find({ 
       role: { $ne: 'ADMIN' },
       updatedAt: { $lt: ninetyDaysAgo },
       balance: { $gt: 0 }
    }).exec();

    for (const user of staleUsers) {
      // Vérifier la dernière transaction
      const lastTxn = await this.transactionModel.findOne({ userId: user._id }).sort({ createdAt: -1 }).exec();
      const lastActivity = lastTxn ? (lastTxn as any).createdAt : (user as any).createdAt;
      
      if (lastActivity < ninetyDaysAgo) {
        // Calculer l'équivalent de 1 B$ dans la devise de l'utilisateur
        const feeAmount = await this.currencyService.convertFromBSD(1, user.currency || 'USD');
        if (user.balance >= feeAmount) {
          user.balance -= feeAmount;
          // Forcer la modification de "updatedAt" pour ne pas le re-taxer demain !
          await this.userModel.updateOne({ _id: user._id }, { $set: { balance: user.balance, updatedAt: new Date() } }).exec();
          await this.collectSystemFee(feeAmount, user.currency || 'USD', `Frais d'inactivité (90j) prélevés sur ${user.fullName}`);
        }
      }
    }
    
    console.log('[Treasury] Collecte terminée. Taxes sécurisées.');
  }

  async collectSystemFee(amount: number, fromCurrency: string, reason: string): Promise<void> {
    const admin = await this.userModel.findOne({ role: 'ADMIN' }, null, { sort: { createdAt: 1 } }).exec();
    if (!admin) return; // Silent return if no admin exists to take the fees

    const adminCurrency = admin.currency || 'USD';
    const amountInAdminCurrency = await this.currencyService.convertExact(amount, fromCurrency, adminCurrency);
    const finalAmount = parseFloat(amountInAdminCurrency.toFixed(2));

    if (finalAmount > 0) {
      await this.userModel.findByIdAndUpdate(
        admin._id,
        { $inc: { balance: finalAmount } }
      ).exec();

      const feeTxn = new this.transactionModel({
        userId: admin._id,
        type: 'TRANSFER_IN',
        amount: finalAmount,
        description: reason,
        status: 'SUCCESS',
        category: 'Système',
        originalAmount: amount,
        originalCurrency: fromCurrency,
        targetAmount: finalAmount,
        targetCurrency: adminCurrency,
        exchangeRate: 1
      });
      await feeTxn.save();
    }
  }

  async getStats() {
    const users = await this.userModel.find();
    const cards = await this.cardModel.find();
    
    const userBalanceTotal = users.reduce((acc, u) => acc + (u.balance || 0), 0);
    const cardBalanceTotal = cards.reduce((acc, c) => acc + (c.cardBalance || 0), 0);
    const totalValueLocked = userBalanceTotal + cardBalanceTotal;
    
    const userCount = users.length;
    const activeUsers = users.filter(u => u.status === 'ACTIVE').length;
    
    const transactions = await this.transactionModel.find();
    const totalVolume = transactions.reduce((acc, t) => acc + t.amount, 0);

    return {
      totalValueLocked,
      userCount,
      activeUsers,
      totalVolume,
      monthlyActiveUsers: '84.2k', // Fake for demo image
      dailyVolume: totalVolume / 30, // Rough estimate
      systemHealth: 'Healthy',
      latency: '14ms'
    };
  }

  async getAllUsers() {
    return this.userModel.find().select('-password').exec();
  }

  async toggleUserStatus(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new BadRequestException("Vous ne pouvez pas vous bloquer vous-même.");
    }
    const user = await this.userModel.findById(userId);
    if (!user) return null;
    user.status = user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    return user.save();
  }

  async getGlobalFeed() {
    return this.transactionModel
      .find()
      .populate('userId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();
  }

  async getUserDetails(userId: string) {
    const user = await this.userModel.findById(userId).select('-password').exec();
    if (!user) throw new BadRequestException('Utilisateur introuvable');
    
    const cards = await this.cardModel.find({ userId }).exec();
    
    // Find all transactions where the user is either the owner, sender, or recipient
    const transactions = await this.transactionModel.find({
      $or: [
        { userId: userId },
        { senderId: userId },
        { recipientId: userId }
      ]
    })
    .populate('senderId', 'fullName email')
    .populate('recipientId', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(50)
    .exec();

    return {
      user,
      cards,
      transactions
    };
  }
}
