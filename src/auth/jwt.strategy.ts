import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret || secret === 'generer-une-cle-secrete-tres-longue-en-production') {
      throw new Error('JWT_SECRET est introuvable ou non sécurisé dans les variables d\'environnement');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      return null;
    }

    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Votre compte est bloqué.');
    }
    return { 
      id: user._id, 
      email: user.email, 
      role: user.role, 
      fullName: user.fullName,
      balance: user.balance,
      currency: user.currency 
    };
  }
}
