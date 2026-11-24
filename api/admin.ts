import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Inject,
  Module,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Database,
  auditSystem,
  assertMunicipalAdmin,
  AuthGuard,
  type AuthRequest,
  type Role,
  allow,
  audit,
  passwordHash,
  auditEventIntegrity,
  id,
  DEMO,
} from './core';
export const roles = z.enum([
  'applicant',
  'protocol',
  'analyst',
  'authority',
  'inspector',
  'ombudsman',
  'municipal_admin',
  'supplier',
]);
@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(@Inject(Database) readonly db: Database) {}
  @Get('team') async team(@Req() r: AuthRequest) {
    allow(r.actor, 'municipal_admin', 'protocol', 'authority', 'analyst', 'inspector');
    return this.db.system(
      async (q) =>
        (
          await q.query(
            'SELECT u.id,u.name,u.email,m.role,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.municipality_id=$1 ORDER BY u.name',
            [r.actor.municipalityId],
          )
        ).rows,
    );
  }
  @Post('team') async addUser(@Req() r: AuthRequest, @Body() input: unknown) {
    allow(r.actor, 'municipal_admin');
    const b = z
      .object({
        name: z.string().trim().min(3).max(160),
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase().trim()),
        password: z.string().min(12).max(200),
        role: roles,
      })
      .parse(input);
    const result = await this.db.system(async (q) => {
      await assertMunicipalAdmin(q, r.actor);
      const existing = (await q.query('SELECT id FROM users WHERE email=$1', [b.email])).rows[0];
      if (existing)
        throw new BadRequestException(
          'Esta conta já existe. O vínculo deve ser feito por convite, sem trocar a senha existente.',
        );
      const person = (
        await q.query(
          'INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',
          [b.email, b.name, passwordHash(b.password)],
        )
      ).rows[0];
      await q.query('INSERT INTO memberships(municipality_id,user_id,role) VALUES($1,$2,$3)', [
        r.actor.municipalityId,
        person.id,
        b.role,
      ]);
      await auditSystem(q, r.actor, 'membership.created', {
        userId: person.id,
        role: b.role,
        email: b.email,
      });
      return person;
    });
    return result;
  }
  @Post('team/:id') async editUser(
    @Req() r: AuthRequest,
    @Param('id') userId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'municipal_admin');
    const b = z
      .object({ role: roles, active: z.boolean(), reason: z.string().trim().min(10).max(1000) })
      .parse(input);
    if (id(userId) === r.actor.id)
      throw new ForbiddenException('Outro administrador deve alterar seu próprio acesso');
    await this.db.system(async (q) => {
      await assertMunicipalAdmin(q, r.actor);
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        r.actor.municipalityId + ':admins',
      ]);
      const old = (
        await q.query(
          'SELECT * FROM memberships WHERE municipality_id=$1 AND user_id=$2 FOR UPDATE',
          [r.actor.municipalityId, userId],
        )
      ).rows[0];
      if (!old) throw new NotFoundException('Pessoa não encontrada');
      if (
        old.role === 'municipal_admin' &&
        old.active &&
        (!b.active || b.role !== 'municipal_admin')
      ) {
        const count = (
          await q.query(
            "SELECT count(*)::int AS n FROM memberships WHERE municipality_id=$1 AND role='municipal_admin' AND active",
            [r.actor.municipalityId],
          )
        ).rows[0].n;
        if (count < 2)
          throw new BadRequestException('Preserve ao menos um administrador municipal ativo');
      }
      await q.query(
        'UPDATE memberships SET role=$1,active=$2 WHERE municipality_id=$3 AND user_id=$4',
        [b.role, b.active, r.actor.municipalityId, userId],
      );
      await q.query('DELETE FROM sessions WHERE user_id=$1 AND municipality_id=$2', [
        userId,
        r.actor.municipalityId,
      ]);
      await auditSystem(q, r.actor, 'membership.updated', { userId, ...b });
    });
    return { ok: true };
  }
  @Get('support-grants') async grants(@Req() r: AuthRequest) {
    allow(r.actor, 'municipal_admin');
    return this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT id,user_id,granted_by,reason,expires_at,revoked_at,created_at FROM support_grants ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  @Post('support-grants') async grant(@Req() r: AuthRequest, @Body() input: unknown) {
    allow(r.actor, 'municipal_admin');
    const b = z
      .object({
        userId: z.uuid(),
        minutes: z.number().int().min(5).max(60),
        reason: z.string().trim().min(15).max(1000),
        confirmed: z.literal(true),
      })
      .parse(input);
    const result = await this.db.system(async (q) => {
      await assertMunicipalAdmin(q, r.actor);
      if (
        !(
          await q.query(
            "SELECT id FROM memberships WHERE municipality_id=$1 AND user_id=$2 AND role='supplier' AND active",
            [r.actor.municipalityId, b.userId],
          )
        ).rows[0]
      )
        throw new BadRequestException('Selecione um fornecedor vinculado a este município');
      const granted = (
        await q.query(
          'INSERT INTO support_grants(municipality_id,user_id,granted_by,reason,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at',
          [
            r.actor.municipalityId,
            b.userId,
            r.actor.id,
            b.reason,
            new Date(Date.now() + b.minutes * 60000),
          ],
        )
      ).rows[0];
      await auditSystem(q, r.actor, 'support.authorized', {
        grantId: granted.id,
        userId: b.userId,
        reason: b.reason,
        expiresAt: new Date(granted.expires_at).toISOString(),
        scope: 'read_only',
      });
      return granted;
    });
    return result;
  }
  @Post('support-grants/:id/revoke') async revoke(
    @Req() r: AuthRequest,
    @Param('id') grantId: string,
  ) {
    allow(r.actor, 'municipal_admin');
    const result = await this.db.system(async (q) => {
      await assertMunicipalAdmin(q, r.actor);
      const revoked = (
        await q.query(
          'UPDATE support_grants SET revoked_at=now() WHERE id=$1 AND municipality_id=$2 AND revoked_at IS NULL RETURNING id',
          [id(grantId), r.actor.municipalityId],
        )
      ).rows[0];
      if (!revoked) throw new NotFoundException('Autorização não encontrada');
      await auditSystem(q, r.actor, 'support.revoked', { grantId });
      return revoked;
    });
    return { ok: true };
  }
  @Get('holidays') holidays(@Req() r: AuthRequest) {
    return this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            "SELECT id,to_char(date,'YYYY-MM-DD') AS date,name FROM holidays ORDER BY date",
          )
        ).rows,
    );
  }
  @Post('holidays') holiday(@Req() r: AuthRequest, @Body() input: unknown) {
    allow(r.actor, 'municipal_admin');
    const b = z
      .object({ date: z.iso.date(), name: z.string().trim().min(3).max(150) })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      await q.query(
        'INSERT INTO holidays(municipality_id,date,name) VALUES($1,$2,$3) ON CONFLICT(municipality_id,date) DO UPDATE SET name=excluded.name',
        [r.actor.municipalityId, b.date, b.name],
      );
      await audit(q, r.actor, 'calendar.holiday_saved', b);
      return { ok: true };
    });
  }
  @Get('audit') events(@Req() r: AuthRequest) {
    allow(r.actor, 'municipal_admin', 'authority');
    return this.db.tenant(
      r.actor,
      async (q) =>
        (await q.query('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 500')).rows,
    );
  }
  @Get('audit/verify') verify(@Req() r: AuthRequest) {
    allow(r.actor, 'municipal_admin', 'authority');
    return this.db.tenant(r.actor, async (q) => {
      const rows = (await q.query('SELECT * FROM audit_events ORDER BY sequence')).rows;
      let previous = 'GENESIS',
        sequence = 0,
        legacySerializedEvents = 0;
      for (const row of rows) {
        sequence++;
        const integrity = auditEventIntegrity(row);
        if (row.previous_hash !== previous || Number(row.sequence) !== sequence || !integrity)
          return { valid: false, failedAt: sequence, events: rows.length };
        if (integrity === 'legacy_undefined_reason') legacySerializedEvents++;
        previous = row.event_hash;
      }
      const head = (await q.query('SELECT * FROM audit_heads')).rows[0];
      return {
        valid: !head || (head.last_hash === previous && Number(head.sequence) === sequence),
        events: rows.length,
        head: previous,
        legacySerializedEvents,
        externalAnchoring: false,
      };
    });
  }
}
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(@Inject(Database) readonly db: Database) {}
  @Get() dashboard(@Req() r: AuthRequest) {
    return this.db.tenant(r.actor, async (q) => ({
      counts: (
        await q.query(
          `SELECT (SELECT count(*)::int FROM cases) AS processes,(SELECT count(*)::int FROM cases WHERE status<>'closed') AS active,(SELECT count(*)::int FROM cases WHERE status='requirements') AS requirements,(SELECT count(*)::int FROM licenses WHERE status='published_demo') AS licenses,(SELECT count(*)::int FROM conditions WHERE status<>'fulfilled' AND due_date<current_date) AS overdue_conditions,(SELECT count(*)::int FROM cases WHERE status='decision') AS decisions,(SELECT count(*)::int FROM documents WHERE status='sent') AS awaiting_receipt`,
        )
      ).rows[0],
      stages: (await q.query('SELECT status,count(*)::int AS count FROM cases GROUP BY status'))
        .rows,
      recent: (
        await q.query(
          'SELECT c.id,c.protocol,c.title,c.status,c.updated_at,e.name AS establishment_name FROM cases c JOIN establishments e ON e.id=c.establishment_id ORDER BY c.updated_at DESC LIMIT 6',
        )
      ).rows,
      upcoming: (
        await q.query(
          "SELECT d.id,d.case_id,d.title,d.due_date,d.status,c.protocol FROM conditions d JOIN cases c ON c.id=d.case_id WHERE d.status<>'fulfilled' ORDER BY d.due_date LIMIT 5",
        )
      ).rows,
      activity: (
        await q.query(
          "SELECT id,action,created_at,case_id FROM audit_events a WHERE (a.case_id IS NULL OR EXISTS (SELECT 1 FROM cases c WHERE c.id=a.case_id)) AND a.action NOT LIKE 'demo.%' ORDER BY sequence DESC LIMIT 5",
        )
      ).rows,
      municipality: (await q.query('SELECT id,name,state FROM municipalities')).rows[0],
      system: {
        demo: DEMO(),
        database: process.env.DATABASE_URL ? 'PostgreSQL' : 'PostgreSQL embarcado',
        storage: process.env.S3_BUCKET ? 'S3' : 'Arquivos locais criptografados',
        antivirus: process.env.ANTIVIRUS_URL ? 'Configurado' : 'Não configurado',
        ai: 'Desligada',
        officialSignature: 'Não integrada',
        officialDelivery: 'Não integrada',
      },
    }));
  }
}
@Module({ controllers: [AdminController, DashboardController] })
export class AdminModule {}
