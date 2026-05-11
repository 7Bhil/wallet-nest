import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import { SignupDto } from '../auth/dto/signup.dto';
import { CurrencyService } from '../currency/currency.service';
import * as bcrypt from 'bcrypt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UnauthorizedException } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private currencyService: CurrencyService,
  ) {}

  async create(signupDto: SignupDto): Promise<User> {
    // Tous les utilisateurs reçoivent l'équivalent de 1 B$ dans leur coffre fort à la création
    const currency = signupDto.currency || 'USD';
    const initialBalance = await this.currencyService.convertExact(
      1,
      'USD',
      currency,
    );

    const createdUser = new this.userModel({
      ...signupDto,
      currency: currency,
      balance: parseFloat(initialBalance.toFixed(2)),
    });
    return createdUser.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async updateBalance(
    id: string,
    amount: number,
    session?: any,
  ): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $inc: { balance: amount } },
        { new: true, session },
      )
      .exec();
  }

  async deductBalanceSafe(
    id: string,
    amount: number,
    session?: any,
  ): Promise<User | null> {
    return this.userModel
      .findOneAndUpdate(
        { _id: id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, session },
      )
      .exec();
  }

  async updateProfile(id: string, data: Partial<User>): Promise<User | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;

    // S'il change sa devise locale, on doit convertir son argent réel existant
    // sans appliquer de commission (spread) car ce n'est pas un transfert d'une carte à l'autre
    if (data.currency && data.currency !== user.currency) {
      const oldCurrency = user.currency;
      const newCurrency = data.currency;
      const exactConverted = await this.currencyService.convertExact(
        user.balance,
        oldCurrency,
        newCurrency,
      );

      const fee = exactConverted * 0.005;
      data.balance = parseFloat((exactConverted - fee).toFixed(2));

      // FIX LOGIQUE : On doit aussi convertir l'argent sur TOUTES les cartes de l'utilisateur
      // sinon il y a une faille d'arbitrage massive ou une perte de fonds
      const cards = await this.userModel.db.model('Card').find({ userId: id });
      for (const card of cards) {
        const newCardBalance = await this.currencyService.convertExact(
          card.cardBalance,
          oldCurrency,
          newCurrency,
        );
        const newLimitValue = await this.currencyService.convertExact(
          card.limitValue,
          oldCurrency,
          newCurrency,
        );

        await this.userModel.db.model('Card').updateOne(
          { _id: card._id },
          {
            $set: {
              cardBalance: parseFloat(newCardBalance.toFixed(2)),
              limitValue: parseFloat(newLimitValue.toFixed(2)),
              // On met à jour le texte d'affichage de la limite aussi
              limit: `${new Intl.NumberFormat('fr-FR').format(newCardBalance)} / ${new Intl.NumberFormat('fr-FR').format(newLimitValue)} ${newCurrency}`,
            },
          },
        );
      }

      console.log(
        `[FX CRITICAL FIX] Converted User ${id} and all cards from ${oldCurrency} to ${newCurrency}`,
      );
    }

    return this.userModel
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .exec();
  }

  async search(query: string, excludeId: string): Promise<any[]> {
    if (!query || query.length < 2) return [];

    // FIX Sécurité : Échapper les caractères spéciaux Regex pour éviter les attaques ReDoS
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return this.userModel
      .find({
        _id: { $ne: excludeId },
        $or: [
          { fullName: { $regex: safeQuery, $options: 'i' } },
          { email: { $regex: safeQuery, $options: 'i' } },
        ],
      })
      .select('_id fullName email')
      .limit(10)
      .exec();
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');

    const isMatch = await bcrypt.compare(
      changePasswordDto.oldPassword,
      user.password,
    );
    if (!isMatch)
      throw new UnauthorizedException('Ancien mot de passe incorrect');

    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await this.userModel
      .findByIdAndUpdate(userId, { password: hashedPassword })
      .exec();
  }
}
