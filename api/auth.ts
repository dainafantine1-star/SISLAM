import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Inject,
  Module,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import {
  AuthService,
  Database,
  DEMO,
  passwordMatches,
  passwordHash,
  digest,
  encrypt,
  decrypt,
  totp,
  newTotp,
  audit,
} from './core';
const cookie = () => ({
  httpOnly: true,
  secure: !DEMO() || Boolean(process.env.VERCEL),
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 8 * 3600000,
});
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  @Post('login') async login(
    @Body() input: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase().trim()),
        password: z.string().min(1).max(200),
        municipalityId: z.uuid().optional(),
      })
      .parse(input);
    const result = await this.db.system(async (q) => {
      const key = digest(`${req.ip}:${b.email}`),
        limit = (
          await q.query(
            "INSERT INTO rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE rate_limits.hits+1 END,window_start=CASE WHEN rate_limits.window_start<now()-interval '15 minutes' THEN now() ELSE rate_limits.window_start END RETURNING hits",
            [key],
          )
        ).rows[0];
      if (limit.hits > 10) return { error: 'Muitas tentativas. Aguarde quinze minutos.' };
      const person = (
        await q.query(
          'SELECT id,password_hash,auth_version,encrypted_totp FROM users WHERE email=$1 AND active',
          [b.email],
        )
      ).rows[0];
      // Keep invalid-account and invalid-password responses indistinguishable.
      const fallback = 'scrypt:00112233445566778899aabbccddeeff:' + '00'.repeat(64);
      if (!passwordMatches(b.password, person?.password_hash || fallback) || !person)
        return { error: 'E-mail ou senha inválidos' };
      // Limit consecutive failures; switching demo profiles after a valid login is legitimate.
      await q.query('DELETE FROM rate_limits WHERE key=$1', [key]);
      const memberships = (
        await q.query(
          'SELECT m.municipality_id,m.role,c.name FROM memberships m JOIN municipalities c ON c.id=m.municipality_id WHERE m.user_id=$1 AND m.active ORDER BY c.name',
          [person.id],
        )
      ).rows;
      const membership = b.municipalityId
        ? memberships.find((m) => m.municipality_id === b.municipalityId)
        : memberships[0];
      if (!membership) return { error: 'Nenhum acesso ativo para o município selecionado' };
      const token = randomBytes(32).toString('hex');
      await q.query(
        "INSERT INTO sessions(token_hash,user_id,municipality_id,auth_version,mfa_verified,expires_at) VALUES($1,$2,$3,$4,false,now()+interval '8 hours')",
        [digest(token), person.id, membership.municipality_id, person.auth_version],
      );
      return {
        token,
        mfaRequired: membership.role !== 'applicant' && (!DEMO() || Boolean(person.encrypted_totp)),
        mfaConfigured: Boolean(person.encrypted_totp),
      };
    });
    if ('error' in result) throw new UnauthorizedException(result.error);
    res.cookie('sislam_session', result.token, cookie());
    return { ok: true, mfaRequired: result.mfaRequired, mfaConfigured: result.mfaConfigured };
  }
  @Get('me') async me(@Req() req: Request) {
    const actor = await this.auth.actor(req, true);
    return this.db.system(async (q) => ({
      user: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
        mfa: actor.mfa,
        municipalityId: actor.municipalityId,
      },
      memberships: (
        await q.query(
          'SELECT m.municipality_id AS id,c.name,c.state,m.role FROM memberships m JOIN municipalities c ON c.id=m.municipality_id WHERE m.user_id=$1 AND m.active',
          [actor.id],
        )
      ).rows,
      demo: DEMO(),
      mfaRequired: !DEMO() && actor.role !== 'applicant' && !actor.mfa,
    }));
  }
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.cookies?.sislam_session)
      await this.db.system((q) =>
        q.query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies.sislam_session)]),
      );
    res.clearCookie('sislam_session', cookie());
    return { ok: true };
  }
  @Post('municipality') async municipality(@Req() req: Request, @Body() input: unknown) {
    const actor = await this.auth.actor(req, true),
      b = z.object({ municipalityId: z.uuid() }).parse(input);
    return this.db.system(async (q) => {
      if (
        !(
          await q.query(
            'SELECT id FROM memberships WHERE municipality_id=$1 AND user_id=$2 AND active',
            [b.municipalityId, actor.id],
          )
        ).rows[0]
      )
        throw new ForbiddenException('Município não autorizado');
      await q.query(
        'UPDATE sessions SET municipality_id=$1,mfa_verified=false WHERE token_hash=$2',
        [b.municipalityId, actor.session],
      );
      return { ok: true };
    });
  }
  @Post('mfa/setup') async setup(@Req() req: Request, @Body() input: unknown) {
    const actor = await this.auth.actor(req, true),
      b = z.object({ password: z.string().max(200) }).parse(input);
    return this.db.system(async (q) => {
      const row = (
        await q.query('SELECT password_hash,encrypted_totp FROM users WHERE id=$1 FOR UPDATE', [
          actor.id,
        ])
      ).rows[0];
      if (!passwordMatches(b.password, row.password_hash))
        throw new UnauthorizedException('Senha inválida');
      if (row.encrypted_totp) throw new BadRequestException('MFA já configurado');
      const secret = newTotp();
      await q.query('UPDATE users SET encrypted_totp=$1,totp_counter=-1 WHERE id=$2', [
        encrypt(secret).toString('base64'),
        actor.id,
      ]);
      return {
        secret,
        uri: `otpauth://totp/SISLAM:${encodeURIComponent(actor.email)}?secret=${secret}&issuer=SISLAM`,
      };
    });
  }
  @Post('mfa/verify') async verify(@Req() req: Request, @Body() input: unknown) {
    const actor = await this.auth.actor(req, true),
      b = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(input);
    const result = await this.db.system(async (q) => {
      const key = 'mfa:' + actor.id,
        lim = (
          await q.query(
            "INSERT INTO rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE rate_limits.hits+1 END,window_start=CASE WHEN rate_limits.window_start<now()-interval '15 minutes' THEN now() ELSE rate_limits.window_start END RETURNING hits",
            [key],
          )
        ).rows[0];
      if (lim.hits > 10) return false;
      const row = (
        await q.query('SELECT encrypted_totp,totp_counter FROM users WHERE id=$1 FOR UPDATE', [
          actor.id,
        ])
      ).rows[0];
      if (!row.encrypted_totp) return false;
      const secret = decrypt(Buffer.from(row.encrypted_totp, 'base64')).toString(),
        counter = Math.floor(Date.now() / 30000),
        accepted = [counter - 1, counter, counter + 1].find(
          (c) => c > Number(row.totp_counter) && totp(secret, c) === b.code,
        );
      if (accepted === undefined) return false;
      await q.query('UPDATE users SET totp_counter=$1 WHERE id=$2', [accepted, actor.id]);
      await q.query('UPDATE sessions SET mfa_verified=true WHERE token_hash=$1', [actor.session]);
      return true;
    });
    if (!result)
      throw new UnauthorizedException('Código inválido, utilizado ou temporariamente bloqueado');
    return { ok: true };
  }
  @Post('password') async password(@Req() req: Request, @Body() input: unknown) {
    const actor = await this.auth.actor(req),
      b = z
        .object({ currentPassword: z.string().max(200), password: z.string().min(12).max(200) })
        .parse(input);
    await this.db.system(async (q) => {
      const row = (
        await q.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE', [actor.id])
      ).rows[0];
      if (!passwordMatches(b.currentPassword, row.password_hash))
        throw new UnauthorizedException('Senha atual inválida');
      await q.query('UPDATE users SET password_hash=$1,auth_version=auth_version+1 WHERE id=$2', [
        passwordHash(b.password),
        actor.id,
      ]);
      await q.query('DELETE FROM sessions WHERE user_id=$1', [actor.id]);
    });
    return { ok: true, relogin: true };
  }
}
@Module({ controllers: [AuthController] })
export class AuthModule {}
