import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Inject,
  Module,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Database,
  AuthGuard,
  type AuthRequest,
  type Actor,
  type Query,
  allow,
  audit,
  readRoles,
} from './core';
export const requirementSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,60}$/),
  name: z.string().min(3).max(150),
  kind: z.enum(['required', 'conditional', 'waived']),
  condition: z.string().max(300).optional(),
});
export const ruleSchema = z.object({
  activity: z.string().min(3).max(80),
  title: z.string().min(4).max(200),
  status: z.enum(['draft', 'approved_demo']),
  validFrom: z.iso.date(),
  validUntil: z.iso.date().nullable().optional(),
  sourceReference: z.string().min(10).max(2000),
  definition: z.object({
    unit: z.string().min(1).max(60),
    bands: z
      .array(
        z.object({
          max: z.number().positive(),
          label: z.string().max(80),
          potential: z.enum(['baixo', 'médio', 'alto']),
          modality: z.string().max(100),
        }),
      )
      .min(1)
      .max(15),
    documents: z.array(requirementSchema).min(1).max(30),
    note: z.string().max(1000),
  }),
});
export type RuleDefinition = z.infer<typeof ruleSchema>['definition'];
export function validateRule(input: unknown) {
  const b = ruleSchema.parse(input);
  if (b.validUntil && b.validUntil < b.validFrom)
    throw new BadRequestException('A vigência final deve ser posterior à inicial');
  if (new Set(b.definition.documents.map((d) => d.key)).size !== b.definition.documents.length)
    throw new BadRequestException('As chaves dos documentos devem ser únicas');
  if (b.definition.bands.some((band, i) => i > 0 && band.max <= b.definition.bands[i - 1].max))
    throw new BadRequestException('Os limites das faixas devem ser crescentes e distintos');
  if (b.definition.documents.some((d) => d.kind === 'conditional' && !d.condition?.trim()))
    throw new BadRequestException('Informe a hipótese de cada documento condicional');
  return b;
}
export function classify(rows: any[], capacity: number) {
  if (rows.length !== 1)
    return {
      manual: true,
      reason: rows.length
        ? 'Há versões conflitantes na data informada. Revisão humana necessária.'
        : 'Não há regra demonstrativa disponível para esta atividade e data.',
      requirements: [],
    };
  const rule = rows[0],
    definition = rule.definition as RuleDefinition,
    band = definition.bands.find((b) => capacity <= b.max);
  if (!band)
    return {
      manual: true,
      reason: 'A capacidade está fora das faixas cadastradas. Encaminhe à análise manual.',
      ruleId: rule.id,
      ruleVersion: rule.version,
      requirements: definition.documents,
    };
  return {
    manual: definition.documents.some((d) => d.kind === 'conditional'),
    reason: definition.documents.some((d) => d.kind === 'conditional')
      ? 'Há exigências condicionais que precisam de revisão técnica de aplicabilidade.'
      : undefined,
    demonstration: true,
    label: band.label,
    potential: band.potential,
    modality: band.modality,
    unit: definition.unit,
    capacity,
    ruleId: rule.id,
    ruleVersion: rule.version,
    requirements: definition.documents,
    source: rule.source_reference,
    competence: 'Competência a confirmar pelo órgão. Este resultado é apenas demonstrativo.',
    note: definition.note,
  };
}
export async function classifyWithQuery(
  q: Query,
  activity: string,
  capacity: number,
  date: string,
) {
  const rows = (
    await q.query(
      "SELECT * FROM rule_versions WHERE activity=$1 AND status='approved_demo' AND valid_from<=$2::date AND (valid_until IS NULL OR valid_until>=$2::date) ORDER BY version DESC LIMIT 1",
      [activity, date],
    )
  ).rows;
  return { result: classify(rows, capacity), snapshot: rows.length === 1 ? rows[0] : null };
}
@Controller('registry')
@UseGuards(AuthGuard)
export class RegistryController {
  constructor(@Inject(Database) readonly db: Database) {}
  @Get() list(@Req() req: AuthRequest) {
    allow(req.actor, ...readRoles);
    return this.db.tenant(req.actor, async (q) => ({
      organizations: (
        await q.query('SELECT * FROM organizations ORDER BY created_at DESC LIMIT 500')
      ).rows,
      establishments: (
        await q.query(
          'SELECT e.*,o.name AS organization_name FROM establishments e JOIN organizations o ON o.id=e.organization_id ORDER BY e.created_at DESC LIMIT 500',
        )
      ).rows,
    }));
  }
  @Post('organizations') create(@Req() req: AuthRequest, @Body() input: unknown) {
    allow(req.actor, 'applicant', 'protocol', 'municipal_admin');
    const b = z
      .object({
        name: z.string().trim().min(3).max(200),
        registration: z.string().trim().min(5).max(30),
        representative: z.string().trim().min(3).max(160),
        email: z.union([z.email(), z.literal('')]),
        phone: z.string().max(30),
        ownerId: z.uuid().optional(),
      })
      .parse(input);
    return this.db.tenant(req.actor, async (q) => {
      const ownerId = req.actor.role === 'applicant' ? req.actor.id : b.ownerId;
      if (
        !ownerId ||
        !(
          await q.query(
            "SELECT user_id FROM memberships WHERE user_id=$1 AND role='applicant' AND active",
            [ownerId],
          )
        ).rows[0]
      )
        throw new BadRequestException('Escolha um requerente ativo deste município');
      const row = (
        await q.query(
          'INSERT INTO organizations(municipality_id,owner_id,name,registration,representative,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            req.actor.municipalityId,
            ownerId,
            b.name,
            b.registration,
            b.representative,
            b.email,
            b.phone,
          ],
        )
      ).rows[0];
      await audit(q, req.actor, 'organization.created', { organizationId: row.id, name: row.name });
      return row;
    });
  }
  @Post('establishments') establishment(@Req() req: AuthRequest, @Body() input: unknown) {
    allow(req.actor, 'applicant', 'protocol', 'municipal_admin');
    const b = z
      .object({
        organizationId: z.uuid(),
        name: z.string().trim().min(3).max(200),
        activity: z.string().min(3).max(80),
        address: z.string().trim().min(8).max(500),
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
        capacity: z.number().min(0).max(1e12),
        area: z.number().min(0).max(1e12),
      })
      .parse(input);
    return this.db.tenant(req.actor, async (q) => {
      if (!(await q.query('SELECT id FROM organizations WHERE id=$1', [b.organizationId])).rows[0])
        throw new NotFoundException('Organização não encontrada');
      const row = (
        await q.query(
          'INSERT INTO establishments(municipality_id,organization_id,name,activity,address,latitude,longitude,capacity,area) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [
            req.actor.municipalityId,
            b.organizationId,
            b.name,
            b.activity,
            b.address,
            b.latitude,
            b.longitude,
            b.capacity,
            b.area,
          ],
        )
      ).rows[0];
      await audit(q, req.actor, 'establishment.created', {
        establishmentId: row.id,
        name: row.name,
      });
      return row;
    });
  }
}
@Controller('rules')
@UseGuards(AuthGuard)
export class RulesController {
  constructor(@Inject(Database) readonly db: Database) {}
  @Get() list(@Req() req: AuthRequest) {
    allow(req.actor, ...readRoles);
    return this.db.tenant(
      req.actor,
      async (q) =>
        (await q.query('SELECT * FROM rule_versions ORDER BY activity,version DESC')).rows,
    );
  }
  @Post() create(@Req() req: AuthRequest, @Body() input: unknown) {
    allow(req.actor, 'municipal_admin');
    const b = validateRule(input);
    return this.db.tenant(req.actor, async (q) => {
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        req.actor.municipalityId + ':rule:' + b.activity,
      ]);
      const version = Number(
        (
          await q.query(
            'SELECT coalesce(max(version),0)+1 AS next FROM rule_versions WHERE activity=$1',
            [b.activity],
          )
        ).rows[0].next,
      );
      const row = (
        await q.query(
          'INSERT INTO rule_versions(municipality_id,activity,title,version,status,valid_from,valid_until,definition,source_reference,created_by,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
          [
            req.actor.municipalityId,
            b.activity,
            b.title,
            version,
            b.status,
            b.validFrom,
            b.validUntil || null,
            JSON.stringify(b.definition),
            b.sourceReference,
            req.actor.id,
            b.status === 'approved_demo' ? req.actor.id : null,
          ],
        )
      ).rows[0];
      await audit(q, req.actor, 'rule.version_created', {
        ruleId: row.id,
        version,
        status: b.status,
      });
      return row;
    });
  }
  @Post('classify') classify(@Req() req: AuthRequest, @Body() input: unknown) {
    allow(req.actor, ...readRoles);
    const b = z
      .object({
        activity: z.string().max(80),
        capacity: z.number().nonnegative(),
        date: z.iso.date(),
      })
      .parse(input);
    return this.db.tenant(
      req.actor,
      async (q) => (await classifyWithQuery(q, b.activity, b.capacity, b.date)).result,
    );
  }
}
@Module({ controllers: [RegistryController, RulesController] })
export class RegistryRulesModule {}
