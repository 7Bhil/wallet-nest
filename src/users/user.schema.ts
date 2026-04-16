import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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

  @Prop({ default: 'USD' })
  currency: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
