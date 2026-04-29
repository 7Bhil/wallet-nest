import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Card } from './schemas/card.schema';
import { Transaction } from '../transactions/transaction.schema';
import { UsersService } from '../users/users.service';
import { CreateCardDto } from './dto/create-card.dto';

@Injectable()
export class CardsService {
  constructor(
    @InjectModel(Card.name) private cardModel: Model<Card>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    private usersService: UsersService,
  ) {}

  private generateCardNumber(): string {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += Math.floor(1000 + Math.random() * 9000).toString() + (i < 3 ? ' ' : '');
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
      'STANDARD': {
        name: 'Everyday Virtual',
        limitValue: 5000,
        interestRate: 5,
        color: 'from-white to-slate-50',
        text: 'text-slate-900',
        border: 'border-slate-100',
        accent: 'slate',
      },
      'PREMIUM': {
        name: 'Sky Digital',
        limitValue: 25000,
        interestRate: 12,
        color: 'from-blue-600 to-blue-900',
        text: 'text-white',
        border: '',
        accent: 'blue',
      },
      'VIP MEMBER': {
        name: 'The Fluid Black',
        limitValue: 100000,
        interestRate: 18,
        color: 'from-slate-800 to-slate-950',
        text: 'text-white',
        border: '',
        accent: 'emerald',
      }
    };
    return templates[type as keyof typeof templates] || templates['STANDARD'];
  }

  async create(userId: string, createCardDto: CreateCardDto): Promise<Card> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    
    const template = this.getCardTemplate(createCardDto.type);
    
    // Check if user already has 3 cards
    const userCards = await this.cardModel.find({ userId }).exec();
    if (userCards.length >= 3) {
      throw new BadRequestException('Limite de cartes atteinte (3 max)');
    }

    const createdCard = new this.cardModel({
      userId,
      type: createCardDto.type,
      number: this.generateCardNumber(),
      exp: this.generateExp(),
      cvv: this.generateCVV(),
      status: 'ACTIVE',
      limit: `0 / ${template.limitValue} ${user.currency || 'USD'}`,
      ...template
    });
    
    return createdCard.save();
  }

  async findAllByUserId(userId: string): Promise<Card[]> {
    return this.cardModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async freezeCard(userId: string, cardId: string): Promise<Card> {
    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    card.status = card.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    return card.save();
  }

  async remove(userId: string, cardId: string): Promise<void> {
    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) {
      throw new NotFoundException('Carte introuvable');
    }

    // Si la carte avait un solde, on le rend au coffre-fort de l'utilisateur
    if (card.cardBalance > 0) {
      await this.usersService.updateBalance(userId, card.cardBalance);
    }
    
    await this.cardModel.deleteOne({ _id: cardId }).exec();
  }

  /** Alimenter une carte depuis le solde principal (wallet → card) */
  async topupCard(userId: string, cardId: string, amount: number): Promise<Card> {
    if (amount <= 0) throw new BadRequestException('Montant invalide');
    
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if ((user.balance || 0) < amount) {
      throw new BadRequestException(`Solde insuffisant.`);
    }

    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) throw new NotFoundException('Carte introuvable');
    if (card.status === 'FROZEN') throw new BadRequestException('Carte gelée');

    // Vérifier le plafond de la carte
    if (card.cardBalance + amount > card.limitValue) {
      throw new BadRequestException(`Plafond de la carte atteint.`);
    }

    // Create transaction record
    const transaction = new this.transactionModel({
      userId: new Types.ObjectId(userId),
      type: 'CARD_TOPUP',
      amount,
      description: `Alimentation carte ${card.name}`,
      status: 'SUCCESS',
      category: 'Carte',
      toCardId: card._id,
    });

    await this.usersService.updateBalance(userId, -amount);
    card.cardBalance = (card.cardBalance || 0) + amount;
    
    // Update limit string to reflect usage
    card.limit = `${card.cardBalance.toFixed(0)} / ${card.limitValue} ${user.currency || 'USD'}`;
    
    await transaction.save();
    return card.save();
  }

  /** Transférer des B$ d'une carte à une autre (appartenant au même user) */
  async cardTransfer(userId: string, fromCardId: string, toCardId: string, amount: number): Promise<{ from: Card; to: Card }> {
    if (amount <= 0) throw new BadRequestException('Montant invalide');
    if (fromCardId === toCardId) throw new BadRequestException('Les deux cartes doivent être différentes');

    const from = await this.cardModel.findOne({ _id: fromCardId, userId }).exec();
    const to   = await this.cardModel.findOne({ _id: toCardId,   userId }).exec();

    if (!from || !to) throw new NotFoundException('Carte(s) introuvable(s)');
    if (from.status === 'FROZEN') throw new BadRequestException('La carte source est gelée');
    
    // Vérifier le plafond de la carte de destination
    if (to.cardBalance + amount > to.limitValue) {
      throw new BadRequestException(`Plafond de la carte de destination atteint (${to.name}).`);
    }

    if ((from.cardBalance || 0) < amount) {
      throw new BadRequestException(`Solde insuffisant sur cette carte.`);
    }

    from.cardBalance = (from.cardBalance || 0) - amount;
    to.cardBalance   = (to.cardBalance   || 0) + amount;

    // Update limit strings
    const user = await this.usersService.findById(userId);
    const currency = user?.currency || 'USD';
    from.limit = `${from.cardBalance.toFixed(0)} / ${from.limitValue} ${currency}`;
    to.limit = `${to.cardBalance.toFixed(0)} / ${to.limitValue} ${currency}`;

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

    await transaction.save();
    await from.save();
    await to.save();
    return { from, to };
  }

  /** Définir une carte comme carte de réception par défaut */
  async setDefault(userId: string, cardId: string): Promise<void> {
    const card = await this.cardModel.findOne({ _id: cardId, userId }).exec();
    if (!card) throw new NotFoundException('Carte introuvable');
    await this.usersService.updateProfile(userId, { defaultCardId: card._id as any });
  }
}
