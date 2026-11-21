export interface JwtPayload {
  sub: string;
  username: string;
  sid: string;
  type: 'access' | 'refresh';
  jti?: string;
}

export function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.username === 'string' &&
    typeof payload.sid === 'string' &&
    (payload.type === 'access' || payload.type === 'refresh') &&
    (payload.jti === undefined || typeof payload.jti === 'string')
  );
}
