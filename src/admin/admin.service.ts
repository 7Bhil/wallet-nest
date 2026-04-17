import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.schema';
import { Transaction } from '../transactions/transaction.schema';
import { Card } from '../cards/schemas/card.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(Card.name) private cardModel: Model<Card>,
  ) {}

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
}
