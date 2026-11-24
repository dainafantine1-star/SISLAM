import 'reflect-metadata';
import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Global,
  Module,
} from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
export type Role =
  | 'applicant'
  | 'protocol'
  | 'analyst'
  | 'authority'
  | 'inspector'
  | 'ombudsman'
  | 'municipal_admin'
  | 'supplier';
export type Actor = {
  id: string;
  municipalityId: string;
  name: string;
  email: string;
  role: Role;
  mfa: boolean;
  session: string;
  support?: boolean;
};
export type Row = Record<string, any>; // SQL rows are narrowed by the service that owns each query.
export type Query = {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};
export const DEMO = () => process.env.SISLAM_DEMO === '1';
export const digest = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}
export const dataDirectory = () => path.resolve(process.env.DATA_DIR || 'runtime');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: string, stored: string) {
  const [kind, salt, hash] = stored.split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function key() {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32)
    throw new Error('Configure APP_ENCRYPTION_KEY com pelo menos 32 caracteres');
  return createHash('sha256').update(secret).digest();
}
export function encrypt(value: Buffer | string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), nonce),
    body = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([Buffer.from('SIS1'), nonce, cipher.getAuthTag(), body]);
}
export function decrypt(value: Buffer) {
  if (value.subarray(0, 4).toString() !== 'SIS1') throw new Error('Arquivo cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', key(), value.subarray(4, 16));
  decipher.setAuthTag(value.subarray(16, 32));
  return Buffer.concat([decipher.update(value.subarray(32)), decipher.final()]);
}
export function allow(actor: Actor, ...roles: Role[]) {
  if (!roles.includes(actor.role))
    throw new ForbiddenException('Seu perfil não permite esta operação');
  if (!DEMO() && actor.role !== 'applicant' && !actor.mfa)
    throw new ForbiddenException('Confirme o MFA para continuar');
}
export function id(value: string) {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new BadRequestException('Identificador inválido');
  return value;
}
export const readRoles: Role[] = [
  'applicant',
  'protocol',
  'analyst',
  'authority',
  'inspector',
  'municipal_admin',
  'supplier',
];
export function totp(secret: string, counter = Math.floor(Date.now() / 30000)) {
  const bytes: number[] = [];
  let n = 0,
    bits = 0;
  for (const char of secret) {
    n = (n << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((n >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', Buffer.from(bytes)).update(time).digest(),
    o = h[19] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function newTotp() {
  const b = randomBytes(20);
  let output = '',
    bits = 0,
    v = 0;
  for (const byte of b) {
    v = (v << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(v >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
}

@Injectable()
export class Database {
  private embedded?: PGlite;
  private lockFile?: string;
  private pool?: Pool;
  private pending: Promise<void> = Promise.resolve();
  async initialize() {
    if (this.embedded || this.pool) return;
    if (process.env.DATABASE_URL)
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 10000,
      });
    else {
      if (process.env.VERCEL)
        throw new Error('Configure um PostgreSQL persistente para a demonstração online');
      if (!DEMO()) throw new Error('PostgreSQL externo é obrigatório no modo operacional');
      fs.mkdirSync(dataDirectory(), { recursive: true });
      if (process.env.TEST_MEMORY !== '1') {
        this.lockFile = path.join(dataDirectory(), '.sislam-lock');
        if (fs.existsSync(this.lockFile)) {
          const pid = Number(fs.readFileSync(this.lockFile, 'utf8'));
          let running = false;
          try {
            process.kill(pid, 0);
            running = true;
          } catch {}
          if (running)
            throw new Error(
              'A base local está em uso. Feche o SISLAM antes de abrir outra instância ou executar backup.',
            );
          fs.unlinkSync(this.lockFile);
        }
        fs.writeFileSync(this.lockFile, String(process.pid), { flag: 'wx' });
      }
      this.embedded = new PGlite(
        process.env.TEST_MEMORY === '1' ? undefined : path.join(dataDirectory(), 'database'),
      );
    }
  }
  async system<T>(fn: (q: Query) => Promise<T>): Promise<T> {
    await this.initialize();
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client as Query);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    let release!: () => void;
    const previous = this.pending;
    this.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await this.embedded!.exec('BEGIN');
      const result = await fn(this.embedded! as Query);
      await this.embedded!.exec('COMMIT');
      return result;
    } catch (e) {
      await this.embedded!.exec('ROLLBACK');
      throw e;
    } finally {
      release();
    }
  }
  async tenant<T>(actor: Actor, fn: (q: Query) => Promise<T>) {
    return this.system(async (q) => {
      await q.query('SET LOCAL ROLE sislam_runtime');
      await q.query(
        "SELECT set_config('sislam.tenant',$1,true),set_config('sislam.user',$2,true),set_config('sislam.role',$3,true)",
        [actor.municipalityId, actor.id, actor.role],
      );
      return fn(q);
    });
  }
  async migrate() {
    await this.system(async (q) => {
      await q.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const applied = new Set(
        (await q.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
      );
      for (const file of fs
        .readdirSync('db')
        .filter((n) => /^\d+.*\.sql$/.test(n))
        .sort()) {
        if (applied.has(file)) continue;
        const sql = fs.readFileSync(path.join('db', file), 'utf8');
        if (this.embedded) await this.embedded.exec(sql);
        else await q.query(sql);
        await q.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
      }
    });
  }
  async close() {
    await this.pool?.end();
    await this.embedded?.close();
    if (
      this.lockFile &&
      fs.existsSync(this.lockFile) &&
      fs.readFileSync(this.lockFile, 'utf8') === String(process.pid)
    )
      fs.unlinkSync(this.lockFile);
  }
}

export function auditEventIntegrity(row: Row): 'exact' | 'legacy_undefined_reason' | false {
  const version = Number(row.serialization_version);
  if (version !== 1 && version !== 2) return false;
  const value = {
    id: row.id,
    municipalityId: row.municipality_id,
    actorId: row.actor_id,
    caseId: row.case_id,
    sequence: Number(row.sequence),
    action: row.action,
    payload: row.payload,
    previous: row.previous_hash,
    at: new Date(row.created_at).toISOString(),
    ...(version === 2 ? { serializationVersion: 2 } : {}),
  };
  if (digest(canonical(value)) === row.event_hash) return 'exact';
  // Early demo writers hashed an undefined classification.reason before JSONB
  // omitted that key. Reconstruct only that known representation, and require
  // the complete original digest to match. Never rewrite historical rows.
  if (
    version === 1 &&
    row.action === 'case.filed' &&
    row.payload?.classification?.manual === false &&
    row.payload.classification.demonstration === true &&
    !Object.hasOwn(row.payload.classification, 'reason')
  ) {
    const legacy = {
      ...value,
      payload: {
        ...row.payload,
        classification: { ...row.payload.classification, reason: undefined },
      },
    };
    if (digest(canonical(legacy)) === row.event_hash) return 'legacy_undefined_reason';
  }
  return false;
}
export async function audit(q: Query, actor: Actor, action: string, payload: Row, caseId?: string) {
  // Hash the same representation that will actually be persisted as JSONB.
  payload = JSON.parse(JSON.stringify({ ...payload, actorName: actor.name }));
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`audit:${actor.municipalityId}`]);
  await q.query('INSERT INTO audit_heads(municipality_id) VALUES($1) ON CONFLICT DO NOTHING', [
    actor.municipalityId,
  ]);
  const head = (await q.query('SELECT sequence,last_hash FROM audit_heads FOR UPDATE')).rows[0];
  const previous = head.last_hash,
    sequence = Number(head.sequence) + 1,
    uuid = randomUUID(),
    at = new Date().toISOString();
  const hash = digest(
    canonical({
      id: uuid,
      municipalityId: actor.municipalityId,
      actorId: actor.id,
      caseId: caseId || null,
      sequence,
      action,
      payload,
      previous,
      at,
      serializationVersion: 2,
    }),
  );
  await q.query(
    'INSERT INTO audit_events(id,municipality_id,actor_id,case_id,sequence,action,payload,previous_hash,event_hash,created_at,serialization_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,2)',
    [
      uuid,
      actor.municipalityId,
      actor.id,
      caseId || null,
      sequence,
      action,
      JSON.stringify(payload),
      previous,
      hash,
      at,
    ],
  );
  await q.query('UPDATE audit_heads SET sequence=$1,last_hash=$2', [sequence, hash]);
}
export async function auditSystem(q: Query, actor: Actor, action: string, payload: Row) {
  await q.query('SET LOCAL ROLE sislam_runtime');
  await q.query(
    "SELECT set_config('sislam.tenant',$1,true),set_config('sislam.user',$2,true),set_config('sislam.role',$3,true)",
    [actor.municipalityId, actor.id, actor.role],
  );
  await audit(q, actor, action, payload);
}
export async function assertMunicipalAdmin(q: Query, actor: Actor) {
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    actor.municipalityId + ':administration',
  ]);
  const row = (
    await q.query(
      "SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id AND u.active JOIN sessions s ON s.user_id=u.id AND s.auth_version=u.auth_version WHERE m.user_id=$1 AND m.municipality_id=$2 AND m.active AND m.role='municipal_admin' AND s.token_hash=$3 AND s.expires_at>now()",
      [actor.id, actor.municipalityId, actor.session],
    )
  ).rows[0];
  if (!row) throw new ForbiddenException('A autorização administrativa mudou. Entre novamente.');
}

@Injectable()
export class AuthService {
  constructor(@Inject(Database) readonly db: Database) {}
  async actor(req: Request, allowPendingMfa = false): Promise<Actor> {
    const token = req.cookies?.sislam_session;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Entre na sua conta');
    return this.db.system(async (q) => {
      const row = (
        await q.query(
          `SELECT u.id,u.email,u.name,s.municipality_id,s.mfa_verified,m.role FROM sessions s JOIN users u ON u.id=s.user_id AND u.active AND u.auth_version=s.auth_version JOIN memberships m ON m.user_id=u.id AND m.municipality_id=s.municipality_id AND m.active WHERE s.token_hash=$1 AND s.expires_at>now()`,
          [digest(token)],
        )
      ).rows[0];
      if (!row) throw new UnauthorizedException('Sua sessão expirou');
      const actor: Actor = {
        id: row.id,
        email: row.email,
        name: row.name,
        municipalityId: row.municipality_id,
        role: row.role,
        mfa: row.mfa_verified,
        session: digest(token),
      };
      if (actor.role === 'supplier') {
        const grant = (
          await q.query(
            'SELECT id FROM support_grants WHERE municipality_id=$1 AND user_id=$2 AND expires_at>now() AND revoked_at IS NULL',
            [actor.municipalityId, actor.id],
          )
        ).rows[0];
        if (!grant)
          throw new ForbiddenException(
            'O acesso do fornecedor exige autorização temporária do município',
          );
        actor.support = true;
      }
      if (!allowPendingMfa && !DEMO() && actor.role !== 'applicant' && !actor.mfa)
        throw new ForbiddenException('MFA_REQUIRED');
      return actor;
    });
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.actor = await this.auth.actor(req);
    if (req.actor.support)
      await this.auth.db.tenant(req.actor, (q) =>
        audit(q, req.actor, 'support.resource_accessed', { method: req.method, path: req.path }),
      );
    return true;
  }
}
export type AuthRequest = Request & { actor: Actor };
@Global()
@Module({
  providers: [Database, AuthService, AuthGuard],
  exports: [Database, AuthService, AuthGuard],
})
export class CoreModule {}
