import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.schema';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async signup(signupDto: SignupDto) {
    const existingUser = await this.usersService.findByEmail(signupDto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(signupDto.password, 10);
    const user = await this.usersService.create({
      ...signupDto,
      password: hashedPassword,
    });

    const payload = {
      email: user.email,
      sub: user._id,
      role: user.role,
      fullName: user.fullName,
    };
    const access_token = this.jwtService.sign(payload);

    return {
      message: 'User created successfully',
      access_token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException(
        "Votre compte a été suspendu. Veuillez contacter l'administrateur.",
      );
    }

    // Log the successful login
    await this.auditService.create({
      userId: (user as any)._id,
      action: AuditAction.LOGIN,
      target: 'Auth',
    });

    const payload = {
      email: user.email,
      sub: user._id,
      role: user.role,
      fullName: user.fullName,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }
}
