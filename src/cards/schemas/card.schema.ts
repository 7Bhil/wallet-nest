import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Card extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({ required: true, enum: ['STANDARD', 'PREMIUM', 'VIP MEMBER'] })
  type: string;

  @Prop({ required: true })
  name: string; // e.g., "The Fluid Black"

  @Prop({ required: true })
  number: string; // 16 digits

  @Prop({ required: true })
  exp: string; // MM/YY

  @Prop({ required: true })
  cvv: string; // 3 digits

  @Prop({ required: true })
  limit: string; // e.g., "$100,000 / Unlimited"

  @Prop({ default: 'ACTIVE', enum: ['ACTIVE', 'LIMIT NEAR', 'FROZEN'] })
  status: string;

  @Prop({ required: true })
  color: string; // Tailwind gradient classes

  @Prop()
  text?: string;

  @Prop()
  border?: string;

  @Prop()
  accent?: string;

  @Prop({ default: 0 })
  limitValue: number;

  @Prop({ default: 0 })
  interestRate: number;
}

export const CardSchema = SchemaFactory.createForClass(Card);
