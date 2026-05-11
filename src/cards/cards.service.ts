import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Card } from './schemas/card.schema';
import { Transaction } from '../transactions/transaction.schema';
import { UsersService } from '../users/users.service';
import { CurrencyService } from '../currency/currency.service';
import { CreateCardDto } from './dto/create-card.dto';

@Injectable()
export class CardsService implements OnModuleInit {
  constructor(
    @InjectModel(Card.name) private cardModel: Model<Card>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private usersService: UsersService,
    private currencyService: CurrencyService,
  ) {}

  async onModuleInit() {
    setTimeout(() => this.syncAllCardLimits(), 5000);
  }

  async syncAllCardLimits() {
    const cards = await this.cardModel.find().exec();
    for (const card of cards) {
      const user = await this.usersService.findById(card.userId);
      if (!user) continue;

      const template = this.getCardTemplate(card.type);
      const currency = user.currency || 'USD';

      const rawLimit = await this.currencyService.convertFromBSD(
        template.limitBSD,
        currency,
      );
      const prettyLimit = this.currencyService.roundToPretty(
        rawLimit,
        currency,
      );

      if (
        card.limitValue !== prettyLimit ||
        !card.name.includes(template.name) ||
        card.interestRate !== template.interestRate
      ) {
        await this.cardModel
          .updateOne(
            { _id: card._id },
            {
              limitValue: prettyLimit,
              name: template.name,
              interestRate: template.interestRate,
              color: template.color,
              text: template.text,
              accent: template.accent,
            },
          )
          .exec();
      }
    }
  }

  private generateCardNumber(): string {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result +=
        Math.floor(1000 + Math.random() * 9000).toString() + (i < 3 ? ' ' : '');
    }
    return result;
  }

  private generateCVV(): string {
    return Math.floor(100 + Math.random() * 900).toString();
  }

  private generateExp(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear() + 3).slice(-2);
    return `${month}/${year}`;
  }

  private getCardTemplate(type: string) {
    const templates = {
      STANDARD: {
        name: 'Everyday Blue',
        limitBSD: 200,
        interestRate: 1,
        priceXOF: 200,
        color: 'card-premium-blue',
        text: 'text-white',
        border: '',
        accent: 'blue',
      },
      'VIP MEMBER': {
        name: 'Obsidian Black',
        limitBSD: 50000,
        interestRate: 0.5,
        priceXOF: 300,
        color: 'card-glossy-black',
        text: 'text-white',
        border: '',
        accent: 'emerald',
      },
      PREMIUM: {
        name: 'Gold Horizon',
        limitBSD: 1700,
        interestRate: 0.3,
        priceXOF: 500,
        color: 'card-lustrous-gold',
        text: 'text-amber-950',
        border: '',
        accent: 'amber',
      },
    };
    return templates[type as keyof typeof templates] || templates['STANDARD'];
  }

  async create(userId: string, createCardDto: CreateCardDto): Promise<Card> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const template = this.getCardTemplate(createCardDto.type);

    const userCards = await this.cardModel.find({ userId }).exec();
    if (userCards.length >= 3) {
      throw new BadRequestException('Limite de cartes atteinte (3 max)');
    }

    const currency = user.currency || 'USD';
    const rawLimit = await this.currencyService.convertFromBSD(
      template.limitBSD,
      currency,
    );
    const prettyLimit = this.currencyService.roundToPretty(rawLimit, currency);

    const bsdPrice = await this.currencyService.convertToBSD(
      (template as any).priceXOF,
      'XOF',
    );
    const price = await this.currencyService.convertFromBSD(bsdPrice, currency);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const deductSuccess = await this.usersService.deductBalanceSafe(
        userId,
        price,
        session,
      );
      if (!deductSuccess) {
        throw new BadRequestException(
          `Solde insuffisant pour créer cette carte.`,
        );
      }

      const createdCard = new this.cardModel({
        userId,
        type: createCardDto.type,
        number: this.generateCardNumber(),
        exp: this.generateExp(),
        cvv: this.generateCVV(),
        status: 'ACTIVE',
        limitValue: prettyLimit,
        limit: `0 / ${new Intl.NumberFormat('fr-FR').format(prettyLimit)} ${currency}`,
        ...template,
      });

      const purchaseTxn = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        type: 'PAYMENT',
        amount: price,
        description: `Achat Carte ${template.name}`,
        status: 'SUCCESS',
        category: 'Système',
      });

      await purchaseTxn.save({ session });
      const savedCard = await createdCard.save({ session });

      await session.commitTransaction();
      return savedCard;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAllByUserId(userId: string): Promise<Card[]> {
    return this.cardModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async freezeCard(userId: string, cardId: string): Promise<Card> {
    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) throw new NotFoundException('Card not found');
    card.status = card.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    return card.save();
  }

  async remove(userId: string, cardId: string): Promise<void> {
    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) throw new NotFoundException('Carte introuvable');

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      if (card.cardBalance > 0) {
        await this.usersService.updateBalance(
          userId,
          card.cardBalance,
          session,
        );
      }

      await this.cardModel.deleteOne({ _id: cardId }, { session }).exec();
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async topupCard(
    userId: string,
    cardId: string,
    amount: number,
  ): Promise<Card> {
    if (amount <= 0) throw new BadRequestException('Montant invalide');

    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if ((user.balance || 0) < amount)
      throw new BadRequestException(`Solde insuffisant.`);

    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) throw new NotFoundException('Carte introuvable');
    if (card.status !== 'ACTIVE')
      throw new BadRequestException('Carte gelée ou inactive');

    if (card.cardBalance + amount > card.limitValue) {
      throw new BadRequestException(`Plafond de la carte atteint.`);
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const deductSuccess = await this.usersService.deductBalanceSafe(
        userId,
        amount,
        session,
      );
      if (!deductSuccess) throw new BadRequestException('Solde insuffisant');

      const updatedCard = await this.cardModel
        .findOneAndUpdate(
          {
            _id: cardId,
            userId,
            status: 'ACTIVE',
            cardBalance: { $lte: card.limitValue - amount },
          },
          {
            $inc: { cardBalance: amount },
            $set: {
              limit: `${new Intl.NumberFormat('fr-FR').format(card.cardBalance + amount)} / ${new Intl.NumberFormat('fr-FR').format(card.limitValue)} ${user.currency || 'USD'}`,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!updatedCard)
        throw new BadRequestException('Action impossible (Plafond/Status)');

      const transaction = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        type: 'CARD_TOPUP',
        amount,
        description: `Alimentation carte ${card.name}`,
        status: 'SUCCESS',
        category: 'Carte',
        toCardId: card._id,
      });

      await transaction.save({ session });
      await session.commitTransaction();
      return updatedCard;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async cardTransfer(
    userId: string,
    fromCardId: string,
    toCardId: string,
    amount: number,
  ): Promise<{ from: Card; to: Card }> {
    if (amount <= 0) throw new BadRequestException('Montant invalide');
    if (fromCardId === toCardId)
      throw new BadRequestException('Les deux cartes doivent être différentes');

    const from = await this.cardModel
      .findOne({ _id: fromCardId, userId })
      .exec();
    const to = await this.cardModel.findOne({ _id: toCardId, userId }).exec();

    if (!from || !to) throw new NotFoundException('Carte(s) introuvable(s)');
    if (from.status !== 'ACTIVE')
      throw new BadRequestException('La carte source est gelée');
    if (to.status !== 'ACTIVE')
      throw new BadRequestException('La carte destination est inactive');

    if (to.cardBalance + amount > to.limitValue)
      throw new BadRequestException(`Plafond atteint.`);
    if ((from.cardBalance || 0) < amount)
      throw new BadRequestException(`Solde insuffisant.`);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const nf = new Intl.NumberFormat('fr-FR');
      const user = await this.usersService.findById(userId);
      const currency = user?.currency || 'USD';

      const fromUpdate = await this.cardModel
        .findOneAndUpdate(
          { _id: fromCardId, userId, cardBalance: { $gte: amount } },
          {
            $inc: { cardBalance: -amount },
            $set: {
              limit: `${nf.format(from.cardBalance - amount)} / ${nf.format(from.limitValue)} ${currency}`,
            },
          },
          { new: true, session },
        )
        .exec();

      const toUpdate = await this.cardModel
        .findOneAndUpdate(
          {
            _id: toCardId,
            userId,
            cardBalance: { $lte: to.limitValue - amount },
          },
          {
            $inc: { cardBalance: amount },
            $set: {
              limit: `${nf.format(to.cardBalance + amount)} / ${nf.format(to.limitValue)} ${currency}`,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!fromUpdate || !toUpdate)
        throw new BadRequestException('Transfert interrompu (Solde/Plafond)');

      const transaction = new this.transactionModel({
        userId: new Types.ObjectId(userId),
        type: 'CARD_TRANSFER',
        amount,
        description: `Transfert ${from.name} → ${to.name}`,
        status: 'SUCCESS',
        category: 'Carte',
        fromCardId: from._id,
        toCardId: to._id,
      });

      await transaction.save({ session });
      await session.commitTransaction();
      return { from: fromUpdate, to: toUpdate };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async setDefault(userId: string, cardId: string): Promise<void> {
    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) throw new NotFoundException('Carte introuvable');
    await this.usersService.updateProfile(userId, {
      defaultCardId: card._id as any,
    });
  }
}
