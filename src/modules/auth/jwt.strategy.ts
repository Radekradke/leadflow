import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from './auth.types';

/** Lê o token do cookie httpOnly (e NÃO de header Authorization). */
const cookieExtractor = (req: Request): string | null => {
  const token = (req?.cookies as Record<string, string> | undefined)?.[
    'access_token'
  ];
  return token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      // Falha barulhenta no boot se o segredo não estiver definido.
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  /**
   * Roda só depois de a assinatura e a expiração já terem sido validadas.
   * Stateless: não bate no banco. O retorno vira request.user.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      teamId: payload.teamId,
      roleType: payload.roleType,
      permissions: payload.permissions,
    };
  }
}
