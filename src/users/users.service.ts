import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import { SignupDto } from '../auth/dto/signup.dto';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private currencyService: CurrencyService
  ) {}

  async create(signupDto: SignupDto): Promise<User> {
    // Tous les utilisateurs reçoivent l'équivalent de 1 B$ dans leur coffre fort à la création
    const currency = signupDto.currency || 'USD';
    const initialBalance = await this.currencyService.convertExact(1, 'USD', currency);

    const createdUser = new this.userModel({
      ...signupDto,
      currency: currency,
      balance: parseFloat(initialBalance.toFixed(2))
    });
    return createdUser.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async updateBalance(id: string, amount: number): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      { $inc: { balance: amount } },
      { new: true }
    ).exec();
  }

  async deductBalanceSafe(id: string, amount: number): Promise<User | null> {
    return this.userModel.findOneAndUpdate(
      { _id: id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    ).exec();
  }

  async updateProfile(id: string, data: Partial<User>): Promise<User | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;

    // S'il change sa devise locale, on doit convertir son argent réel existant
    // sans appliquer de commission (spread) car ce n'est pas un transfert d'une carte à l'autre
    if (data.currency && data.currency !== user.currency) {
      const exactConverted = await this.currencyService.convertExact(user.balance, user.currency, data.currency);
      data.balance = parseFloat(exactConverted.toFixed(2));
    }

    return this.userModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    ).exec();
  }

  async search(query: string, excludeId: string): Promise<any[]> {
    if (!query || query.length < 2) return [];
    
    return this.userModel.find({
      _id: { $ne: excludeId },
      $or: [
        { fullName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id fullName email')
    .limit(10)
    .exec();
  }
}
