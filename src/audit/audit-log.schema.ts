import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AuditAction {
  LOGIN = 'LOGIN',
  PAGE_VISIT = 'PAGE_VISIT',
  LOGOUT = 'LOGOUT',
  SENSITIVE_ACTION = 'SENSITIVE_ACTION',
}

@Schema({ timestamps: true })
export class AuditLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  @Prop({ required: true, enum: AuditAction })
  action: AuditAction;

  @Prop({ required: false })
  target?: string; // e.g., URL path or specific resource ID

  @Prop({ required: false })
  ip?: string;

  @Prop({ required: false })
  userAgent?: string;

  @Prop({ type: Object, required: false })
  metadata?: any;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
