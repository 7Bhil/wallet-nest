import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async onModuleInit() {
    await this.seedAdmin();
  }

  async seedAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.log('ℹ️ Seeding Admin ignoré (ADMIN_EMAIL ou ADMIN_PASSWORD non définis)');
      return;
    }

    const existingAdmin = await this.userModel.findOne({ email: adminEmail }).exec();

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const admin = new this.userModel({
        fullName: 'Administrateur Plateforme',
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        balance: 1000000,
        currency: 'USD',
      });
      await admin.save();
      console.log(`✅ Compte Admin créé automatiquement : ${adminEmail}`);
    }
  }
}
