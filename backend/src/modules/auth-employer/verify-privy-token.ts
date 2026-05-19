import { Request } from 'express';
import { AppException } from '../../shared/app.exception';
import { PrivyAuthUser, verifyPrivyAccessToken } from './privyAuth';

export async function verifyPrivyToken(req: Request): Promise<PrivyAuthUser> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppException('No authorization header found', 401);
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppException('Authorization header must be Bearer token', 401);
  }

  return verifyPrivyAccessToken(token);
}
