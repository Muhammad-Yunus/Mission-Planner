import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { ingestApiKeys } from '../db/schema.ts';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

export interface JwtUserPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
  ingestKey?: {
    source: 'env' | 'database';
    keyId?: number;
    vehicleCode?: string | null;
    name: string;
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signUserToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyUserToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }
  return decoded as JwtUserPayload;
}

export function requireUserAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide Authorization: Bearer <token>.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    req.user = verifyUserToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateRawApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  const rawKey = `mp_live_${randomPart}`;
  const keyPrefix = rawKey.slice(0, 14);
  const keyHash = hashApiKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export async function requireIngestApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const headerKey =
    (typeof req.headers['x-api-key'] === 'string' && req.headers['x-api-key'].trim()) ||
    (typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('ApiKey ')
      ? req.headers.authorization.slice('ApiKey '.length).trim()
      : '');

  if (!headerKey) {
    res.status(401).json({
      error: 'Ingest API key required. Supply X-API-Key header or Authorization: ApiKey <key>.',
    });
    return;
  }

  // 1. Check optional server-configured static INGEST_API_KEY via timingSafeEqual
  const envKey = process.env.INGEST_API_KEY?.trim();
  if (envKey) {
    const incomingDigest = crypto.createHash('sha256').update(headerKey).digest();
    const envDigest = crypto.createHash('sha256').update(envKey).digest();
    if (crypto.timingSafeEqual(incomingDigest, envDigest)) {
      req.ingestKey = {
        source: 'env',
        name: 'Configured Environment Ingest Key',
      };
      next();
      return;
    }
  }

  // 2. Check database-managed API keys
  try {
    const incomingHash = hashApiKey(headerKey);
    const [found] = await db
      .select()
      .from(ingestApiKeys)
      .where(and(eq(ingestApiKeys.keyHash, incomingHash), eq(ingestApiKeys.isActive, true)))
      .limit(1);

    if (!found) {
      res.status(403).json({ error: 'Invalid or revoked Ingest API key.' });
      return;
    }

    await db
      .update(ingestApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(ingestApiKeys.id, found.id));

    req.ingestKey = {
      source: 'database',
      keyId: found.id,
      vehicleCode: found.vehicleCode,
      name: found.name,
    };
    next();
  } catch (err) {
    console.error('Ingest key lookup failed:', err);
    res.status(500).json({ error: 'Failed to validate Ingest API key.' });
  }
}
