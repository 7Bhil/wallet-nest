import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Transaction extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['TOPUP', 'PAYMENT', 'FEE', 'TRANSFER', 'TRANSFER_IN', 'TRANSFER_OUT', 'CARD_TOPUP', 'CARD_TRANSFER', 'CRYPTO_BUY', 'CRYPTO_SELL'] })
  type: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: ['SUCCESS', 'PENDING', 'FAILED'], default: 'SUCCESS' })
  status: string;

  @Prop()
  category: string;

  @Prop()
  originalAmount?: number;

  @Prop()
  originalCurrency?: string;

  @Prop()
  targetAmount?: number;

  @Prop()
  targetCurrency?: string;

  @Prop()
  exchangeRate?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  recipientId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Card' })
  fromCardId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Card' })
  toCardId?: Types.ObjectId;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
