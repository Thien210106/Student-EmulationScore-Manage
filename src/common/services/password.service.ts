import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const BCRYPT_COST = 12;
const MAX_PASSWORD_BYTES = 72;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new BadRequestException('Password must be at most 72 UTF-8 bytes');
    }
    return bcrypt.hash(password, BCRYPT_COST);
  }

  compare(password: string, passwordHash: string): Promise<boolean> {
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      return Promise.resolve(false);
    }
    return bcrypt.compare(password, passwordHash);
  }
}
