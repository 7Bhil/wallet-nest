import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ default: 'USER' })
  role: string;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ default: 0 })
  cryptoBalance: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ default: 'ACTIVE', enum: ['ACTIVE', 'BLOCKED'] })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Card' })
  defaultCardId: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
