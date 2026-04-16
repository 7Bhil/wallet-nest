import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Transaction extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['TOPUP', 'PAYMENT', 'FEE', 'TRANSFER'] })
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
  exchangeRate?: number;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
