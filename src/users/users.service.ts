import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import { SignupDto } from '../auth/dto/signup.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(signupDto: SignupDto): Promise<User> {
    const createdUser = new this.userModel(signupDto);
    return createdUser.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async updateBalance(id: string, amount: number): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      { $inc: { balance: amount } },
      { new: true }
    ).exec();
  }

  async updateProfile(id: string, data: Partial<User>): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    ).exec();
  }
}
