import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';

export interface JwtSecrets {
  access: string;
  refresh: string;
}

export function getJwtSecrets(config: ConfigService): JwtSecrets {
  const access = config.get<string>('JWT_ACCESS_SECRET');
  const refresh = config.get<string>('JWT_REFRESH_SECRET');

  if (!access || !refresh || access.length < 32 || refresh.length < 32 || access === refresh) {
    throw new InternalServerErrorException(
      'Configure distinct JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values of at least 32 characters',
    );
  }

  return { access, refresh };
}
