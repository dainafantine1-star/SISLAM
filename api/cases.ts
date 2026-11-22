import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Inject,
  Injectable,
  Module,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import {
  Database,
  AuthGuard,
  type AuthRequest,
  type Actor,
  type Query,
  allow,
  audit,
  readRoles,
  id,
} from './core';
import { classifyWithQuery, type RuleDefinition } from './registry-rules';
import { requirementSchema } from './registry-rules';
export async function caseRow(q: Query, caseId: string, lock = false) {
  const row = (
    await q.query('SELECT * FROM cases WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id(caseId)])
  ).rows[0];
  if (!row) throw new NotFoundException('Processo não encontrado');
  return row;
}
export async function checklist(q: Query, caseData: any) {
  const docs = (
    await q.query(
      'SELECT DISTINCT ON(requirement_key) * FROM documents WHERE case_id=$1 ORDER BY requirement_key,version DESC',
      [caseData.id],
    )
  ).rows;
  return ((caseData.classification?.requirements || []) as RuleDefinition['documents']).map(
    (r) => ({ ...r, document: docs.find((d) => d.requirement_key === r.key) || null }),
  );
}
export function blockingItems(items: any[]) {
  return items.filter(
    (r) =>
      r.kind === 'required' &&
      (!r.document || !['accepted', 'reservation'].includes(r.document.status)),
  );
}
@Injectable()
export class CasesService {
  constructor(@Inject(Database) readonly db: Database) {}
  reclassify(actor: Actor, caseId: string, input: unknown) {
    allow(actor, 'analyst');
    const b = z
      .object({
        label: z.string().min(3).max(100),
        potential: z.enum(['baixo', 'médio', 'alto']),
        modality: z.string().min(3).max(150),
        source: z.string().min(12).max(2000),
        reason: z.string().min(30).max(4000),
        requirements: z.array(requirementSchema).min(1).max(30),
      })
      .parse(input);
    if (b.requirements.some((r) => r.kind === 'conditional'))
      throw new BadRequestException(
        'Resolva os itens condicionais como obrigatório ou dispensado antes de concluir a revisão',
      );
    if (new Set(b.requirements.map((r) => r.key)).size !== b.requirements.length)
      throw new BadRequestException('As chaves documentais devem ser únicas');
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (!['screening', 'requirements', 'analysis'].includes(row.status))
        throw new BadRequestException(
          'Revise o enquadramento durante triagem, complementação ou análise',
        );
      const classification = {
        manual: false,
        demonstration: true,
        technicallyReviewed: true,
        label: b.label,
        potential: b.potential,
        modality: b.modality,
        source: b.source,
        requirements: b.requirements,
        reviewedBy: actor.id,
      };
      await q.query(
        'UPDATE cases SET classification=$1,revision=revision+1,updated_at=now() WHERE id=$2',
        [JSON.stringify(classification), row.id],
      );
      await audit(
        q,
        actor,
        'case.classification_reviewed',
        { before: row.classification, after: classification, reason: b.reason },
        row.id,
      );
      return classification;
    });
  }
  list(actor: Actor) {
    allow(actor, ...readRoles);
    return this.db.tenant(
      actor,
      async (q) =>
        (
          await q.query(
            'SELECT c.*,e.name AS establishment_name,o.name AS organization_name FROM cases c JOIN establishments e ON e.id=c.establishment_id JOIN organizations o ON o.id=e.organization_id ORDER BY c.updated_at DESC,c.id LIMIT 500',
          )
        ).rows,
    );
  }
  detail(actor: Actor, caseId: string) {
    allow(actor, ...readRoles);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId);
      const establishment = (
        await q.query(
          'SELECT e.*,o.name AS organization_name,o.registration,o.representative FROM establishments e JOIN organizations o ON o.id=e.organization_id WHERE e.id=$1',
          [row.establishment_id],
        )
      ).rows[0];
      return {
        ...row,
        establishment,
        checklist: await checklist(q, row),
        documents: (
          await q.query(
            'SELECT id,case_id,requirement_key,version,filename,media_type,bytes,sha256,scan_status,status,uploaded_by,received_at,reviewed_at,review_note,created_at FROM documents WHERE case_id=$1 ORDER BY created_at DESC',
            [row.id],
          )
        ).rows,
        opinions: (
          await q.query('SELECT * FROM opinions WHERE case_id=$1 ORDER BY version DESC', [row.id])
        ).rows,
        licenses: (
          await q.query('SELECT * FROM licenses WHERE case_id=$1 ORDER BY approved_at DESC', [
            row.id,
          ])
        ).rows,
        notices: (
          await q.query('SELECT * FROM notices WHERE case_id=$1 ORDER BY created_at DESC', [row.id])
        ).rows,
        conditions: (
          await q.query('SELECT * FROM conditions WHERE case_id=$1 ORDER BY due_date', [row.id])
        ).rows,
        timeline: (
          await q.query(
            'SELECT id,action,payload,actor_id,created_at,event_hash FROM audit_events WHERE case_id=$1 ORDER BY sequence DESC LIMIT 200',
            [row.id],
          )
        ).rows,
      };
    });
  }
  create(actor: Actor, input: unknown) {
    allow(actor, 'applicant', 'protocol');
    const b = z
      .object({
        establishmentId: z.uuid(),
        title: z.string().trim().min(5).max(200),
        parentId: z.uuid().nullable().optional(),
      })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const establishment = (
        await q.query(
          'SELECT e.id,o.owner_id FROM establishments e JOIN organizations o ON o.id=e.organization_id WHERE e.id=$1',
          [b.establishmentId],
        )
      ).rows[0];
      if (!establishment) throw new NotFoundException('Empreendimento não encontrado');
      if (b.parentId) {
        const parent = await caseRow(q, b.parentId);
        if (
          parent.establishment_id !== establishment.id ||
          !(await q.query('SELECT id FROM licenses WHERE case_id=$1', [parent.id])).rows[0]
        )
          throw new BadRequestException(
            'A renovação exige licença anterior do mesmo empreendimento',
          );
      }
      const row = (
        await q.query(
          'INSERT INTO cases(municipality_id,establishment_id,owner_id,title,request_type,parent_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            actor.municipalityId,
            establishment.id,
            establishment.owner_id,
            b.title,
            b.parentId ? 'renewal' : 'initial',
            b.parentId || null,
          ],
        )
      ).rows[0];
      await audit(
        q,
        actor,
        b.parentId ? 'case.renewal_created' : 'case.created',
        { title: b.title, parentId: b.parentId || null },
        row.id,
      );
      return row;
    });
  }
  file(actor: Actor, caseId: string, input: unknown) {
    allow(actor, 'applicant', 'protocol');
    const b = z
      .object({ revision: z.number().int().positive(), confirmed: z.literal(true) })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (row.status !== 'draft')
        throw new ConflictException('Este requerimento já foi protocolado');
      if (row.revision !== b.revision)
        throw new ConflictException('O processo mudou. Atualize a página.');
      const establishment = (
        await q.query('SELECT * FROM establishments WHERE id=$1', [row.establishment_id])
      ).rows[0];
      const { result, snapshot } = await classifyWithQuery(
        q,
        establishment.activity,
        Number(establishment.capacity),
        new Date().toISOString().slice(0, 10),
      );
      const protocol = `SIS-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
      const saved = (
        await q.query(
          "UPDATE cases SET status='filed',protocol=$1,rule_id=$2,rule_snapshot=$3,classification=$4,filed_at=now(),updated_at=now(),revision=revision+1 WHERE id=$5 RETURNING *",
          [
            protocol,
            snapshot?.id || null,
            snapshot ? JSON.stringify(snapshot) : null,
            JSON.stringify(result),
            row.id,
          ],
        )
      ).rows[0];
      await audit(
        q,
        actor,
        'case.filed',
        { protocol, classification: result, ruleVersion: snapshot?.version || null },
        row.id,
      );
      return saved;
    });
  }
  transition(actor: Actor, caseId: string, input: unknown) {
    const b = z
      .object({
        to: z.enum(['screening', 'requirements', 'analysis', 'decision', 'closed']),
        reason: z.string().trim().min(8).max(2000),
        revision: z.number().int().positive(),
      })
      .parse(input);
    const allowed: Record<string, string[]> = {
      filed: ['screening'],
      screening: ['requirements', 'analysis'],
      requirements: ['analysis'],
      analysis: ['requirements', 'decision'],
      decision: ['closed', 'analysis'],
      closed: [],
    };
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (row.revision !== b.revision)
        throw new ConflictException('O processo mudou. Atualize a página.');
      if (!allowed[row.status]?.includes(b.to))
        throw new BadRequestException('Transição não permitida para o estado atual');
      if (b.to === 'screening') allow(actor, 'protocol');
      else if (b.to === 'closed') allow(actor, 'authority');
      else allow(actor, 'analyst', 'protocol');
      if (b.to === 'decision') {
        allow(actor, 'analyst');
        const opinion = (
          await q.query('SELECT * FROM opinions WHERE case_id=$1 ORDER BY version DESC LIMIT 1', [
            row.id,
          ])
        ).rows[0];
        if (!opinion || opinion.status !== 'reviewed')
          throw new BadRequestException('Conclua e revise o parecer antes de encaminhar à decisão');
        if (
          opinion.conclusion === 'favorable' &&
          (blockingItems(await checklist(q, row)).length || row.classification?.manual)
        )
          throw new BadRequestException(
            'Existem pendências impeditivas ou enquadramento manual não resolvido',
          );
      }
      if (
        b.to === 'closed' &&
        !(await q.query('SELECT id FROM licenses WHERE case_id=$1', [row.id])).rows[0]
      )
        throw new BadRequestException('Registre uma decisão antes de encerrar');
      const saved = (
        await q.query(
          'UPDATE cases SET status=$1,updated_at=now(),revision=revision+1 WHERE id=$2 RETURNING *',
          [b.to, row.id],
        )
      ).rows[0];
      await audit(
        q,
        actor,
        'case.transition',
        { from: row.status, to: b.to, reason: b.reason },
        row.id,
      );
      return saved;
    });
  }
  opinion(actor: Actor, caseId: string, input: unknown) {
    allow(actor, 'analyst');
    const b = z
      .object({
        conclusion: z.enum(['favorable', 'unfavorable', 'complement']),
        text: z.string().trim().min(30).max(30000),
        reviewed: z.boolean(),
      })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (!['analysis', 'requirements'].includes(row.status))
        throw new BadRequestException('O parecer exige processo em análise ou complementação');
      if (
        b.conclusion === 'favorable' &&
        (blockingItems(await checklist(q, row)).length || row.classification?.manual)
      )
        throw new BadRequestException(
          'Existem documentos pendentes ou enquadramento manual não resolvido',
        );
      const version = Number(
          (
            await q.query(
              'SELECT coalesce(max(version),0)+1 AS next FROM opinions WHERE case_id=$1',
              [row.id],
            )
          ).rows[0].next,
        ),
        saved = (
          await q.query(
            'INSERT INTO opinions(municipality_id,case_id,author_id,version,conclusion,text,status,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [
              actor.municipalityId,
              row.id,
              actor.id,
              version,
              b.conclusion,
              b.text,
              b.reviewed ? 'reviewed' : 'draft',
              b.reviewed ? new Date() : null,
            ],
          )
        ).rows[0];
      await audit(
        q,
        actor,
        'opinion.version_created',
        { opinionId: saved.id, version, conclusion: b.conclusion, reviewed: b.reviewed },
        row.id,
      );
      return saved;
    });
  }
  assign(actor: Actor, caseId: string, input: unknown) {
    allow(actor, 'protocol', 'authority');
    const b = z.object({ userId: z.uuid(), reason: z.string().min(8).max(500) }).parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (
        !(
          await q.query(
            "SELECT user_id FROM memberships WHERE user_id=$1 AND role='analyst' AND active",
            [b.userId],
          )
        ).rows[0]
      )
        throw new BadRequestException('Selecione um técnico ativo deste município');
      await q.query(
        'UPDATE cases SET assigned_to=$1,revision=revision+1,updated_at=now() WHERE id=$2',
        [b.userId, row.id],
      );
      await audit(q, actor, 'case.assigned', { userId: b.userId, reason: b.reason }, row.id);
      return { ok: true };
    });
  }
  draft(actor: Actor, caseId: string) {
    allow(actor, 'analyst', 'protocol');
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId),
        items = await checklist(q, row),
        missing = blockingItems(items);
      return {
        kind: 'deterministic_template',
        aiUsed: false,
        text: `MINUTA DEMONSTRATIVA — REVISÃO HUMANA OBRIGATÓRIA\n\nProcesso ${row.protocol || row.id}\nAssunto: ${row.title}\n\nDocumentação: ${items.length - missing.length} de ${items.length} itens sem pendência impeditiva.\nPendências: ${missing.map((i) => i.name).join('; ') || 'Nenhuma pendência documental identificada pelo checklist.'}\n\nEnquadramento preliminar: ${row.classification?.manual ? 'análise manual necessária' : row.classification?.label || 'Não realizado'}.\nBase: ${row.rule_snapshot?.source_reference || 'Fonte normativa não validada'}.\n\nConclusão técnica: [preencher após análise e vistoria, quando cabível].\nEsta minuta não é decisão nem parecer assinado.`,
        sources: row.rule_snapshot
          ? [
              {
                ruleId: row.rule_id,
                version: row.rule_snapshot.version,
                reference: row.rule_snapshot.source_reference,
              },
            ]
          : [],
      };
    });
  }
}
@Controller('cases')
@UseGuards(AuthGuard)
export class CasesController {
  constructor(@Inject(CasesService) readonly service: CasesService) {}
  @Post(':id/classification') reclassify(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.reclassify(r.actor, id, b);
  }
  @Get() list(@Req() r: AuthRequest) {
    return this.service.list(r.actor);
  }
  @Get(':id') detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.detail(r.actor, id);
  }
  @Post() create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(r.actor, b);
  }
  @Post(':id/file') file(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.file(r.actor, id, b);
  }
  @Post(':id/transition') transition(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.transition(r.actor, id, b);
  }
  @Post(':id/opinion') opinion(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.opinion(r.actor, id, b);
  }
  @Post(':id/assign') assign(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.assign(r.actor, id, b);
  }
  @Get(':id/draft') draft(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.draft(r.actor, id);
  }
}
@Module({ controllers: [CasesController], providers: [CasesService], exports: [CasesService] })
export class CasesModule {}
