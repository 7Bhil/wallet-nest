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
    const adminEmail = 'admin@gmail.com';
    const existingAdmin = await this.userModel.findOne({ email: adminEmail }).exec();

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = new this.userModel({
        fullName: 'Administrateur Wallet',
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        balance: 1000000, // Un peu d'argent pour l'admin par défaut
        currency: 'USD',
      });
      await admin.save();
      console.log('✅ Compte Admin créé automatiquement : admin@gmail.com / admin123');
    }
  }
}
