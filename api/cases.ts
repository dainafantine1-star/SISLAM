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
import {
  municipalWorkflow,
  workflowStep,
  requireWorkflowStep,
  advanceWorkflow,
} from './municipal-workflow';
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
function visibleWorkflowData(actor: Actor, row: any) {
  return actor.role === 'applicant'
    ? {
        communication: row.workflow_data?.communication,
        fee: row.workflow_data?.fee,
        payment: row.workflow_data?.payment,
      }
    : row.workflow_data;
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
      requireWorkflowStep(row, ['4', '5', '6']);
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
    return this.db.tenant(actor, async (q) =>
      (
        await q.query(
          'SELECT c.*,e.name AS establishment_name,o.name AS organization_name FROM cases c JOIN establishments e ON e.id=c.establishment_id JOIN organizations o ON o.id=e.organization_id ORDER BY c.updated_at DESC,c.id LIMIT 500',
        )
      ).rows.map((row) => ({ ...row, workflow_data: visibleWorkflowData(actor, row) })),
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
        workflow: row.workflow_step
          ? {
              current: workflowStep(row),
              steps: row.workflow_snapshot.steps,
              version: row.workflow_snapshot.version,
            }
          : null,
        related: (
          await q.query(
            'SELECT id,protocol,status,title FROM cases WHERE establishment_id=$1 AND id<>$2 ORDER BY created_at DESC',
            [row.establishment_id, row.id],
          )
        ).rows,
        workflow_data: visibleWorkflowData(actor, row),
        notices: (
          await q.query(
            "SELECT * FROM notices WHERE case_id=$1 AND ($2::boolean OR status IN ('dispatched_demo','acknowledged_demo','answered')) ORDER BY created_at DESC",
            [row.id, actor.role !== 'applicant'],
          )
        ).rows,
        conditions: (
          await q.query('SELECT * FROM conditions WHERE case_id=$1 ORDER BY due_date', [row.id])
        ).rows,
        timeline: (
          await q.query(
            "SELECT id,action,payload,actor_id,created_at,event_hash FROM audit_events WHERE case_id=$1 AND ($2::boolean OR (action NOT IN ('notice.draft_created','notice.approve','case.classification_reviewed') AND coalesce(payload->>'audience','')<>'internal')) ORDER BY sequence DESC LIMIT 200",
            [row.id, actor.role !== 'applicant'],
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
        if (parent.workflow_step && parent.workflow_step !== 'renewal_ready')
          throw new BadRequestException(
            'A renovação do roteiro numerado só fica disponível após concluir a etapa 25.',
          );
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
          "INSERT INTO cases(municipality_id,establishment_id,owner_id,title,request_type,parent_id,workflow_step,workflow_snapshot) VALUES($1,$2,$3,$4,$5,$6,'1',$7) RETURNING *",
          [
            actor.municipalityId,
            establishment.id,
            establishment.owner_id,
            b.title,
            b.parentId ? 'renewal' : 'initial',
            b.parentId || null,
            JSON.stringify(municipalWorkflow),
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
      if (row.workflow_step) {
        allow(actor, 'applicant');
        requireWorkflowStep(row, ['1']);
        if (row.revision !== b.revision)
          throw new ConflictException('O processo mudou. Atualize a página.');
        return advanceWorkflow(
          q,
          actor,
          row,
          'complete',
          'Solicitação enviada ao departamento administrativo.',
        );
      }
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
        establishment.capacity_unit || undefined,
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
      if (row.workflow_step)
        throw new BadRequestException(
          'Use a ação da etapa numerada do fluxograma; movimentações genéricas estão bloqueadas.',
        );
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
          ['favorable', 'favorable_reservations'].includes(opinion.conclusion) &&
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
        conclusion: z.enum(['favorable', 'favorable_reservations', 'unfavorable', 'complement']),
        text: z.string().trim().min(30).max(30000),
        reviewed: z.boolean(),
        reason: z.string().trim().min(20).max(2000).optional(),
      })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      requireWorkflowStep(row, ['18']);
      if (!['analysis', 'requirements'].includes(row.status))
        throw new BadRequestException('O parecer exige processo em análise ou complementação');
      if (
        ['favorable', 'favorable_reservations'].includes(b.conclusion) &&
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
      );
      if (version > 1 && !b.reason)
        throw new BadRequestException(
          'Informe a justificativa da revisão do parecer. A versão anterior será preservada.',
        );
      const previous =
        version > 1
          ? (
              await q.query(
                'SELECT id,text,conclusion,status FROM opinions WHERE case_id=$1 ORDER BY version DESC LIMIT 1',
                [row.id],
              )
            ).rows[0]
          : null;
      const saved = (
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
        {
          opinionId: saved.id,
          version,
          conclusion: b.conclusion,
          reviewed: b.reviewed,
          reason: b.reason || null,
          previous,
        },
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
  startWorkflow(actor: Actor, caseId: string, input: unknown) {
    allow(actor, 'applicant', 'protocol');
    const b = z
      .object({
        reason: z.string().trim().min(20).max(2000),
        revision: z.number().int().positive(),
      })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (row.workflow_step || row.status === 'closed')
        throw new BadRequestException('Este processo já segue um roteiro ou está encerrado.');
      if (row.revision !== b.revision)
        throw new ConflictException('O processo mudou. Atualize a página.');
      await q.query(
        "UPDATE cases SET workflow_step='1',workflow_snapshot=$1,revision=revision+1,updated_at=now() WHERE id=$2",
        [JSON.stringify(municipalWorkflow), row.id],
      );
      await audit(
        q,
        actor,
        'case.workflow_started',
        {
          version: municipalWorkflow.version,
          reason: b.reason,
          previousStatus: row.status,
          preservedHistory: true,
        },
        row.id,
      );
      return { ok: true };
    });
  }
  workflow(actor: Actor, caseId: string, input: unknown) {
    const b = z
      .object({
        action: z.string().max(30),
        step: z.string().max(30),
        revision: z.number().int().positive(),
        note: z.string().trim().min(20).max(10000),
        reference: z.string().trim().max(500).optional(),
        amount: z.number().positive().max(1e9).optional(),
      })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true),
        step = workflowStep(row);
      if (!step) throw new BadRequestException('O processo ainda não segue o roteiro numerado.');
      allow(actor, step.role);
      if (row.revision !== b.revision || row.workflow_step !== b.step)
        throw new ConflictException('A etapa mudou. Atualize a página.');
      if (!step.actions.some((a: any) => a.id === b.action))
        throw new BadRequestException('Ação não permitida na etapa atual');
      const items = await checklist(q, row),
        extra: Record<string, unknown> = {};
      const allPresent = () => {
        if (
          items.some(
            (i) =>
              i.kind === 'required' && (!i.document || i.document.scan_status === 'quarantine'),
          )
        )
          throw new BadRequestException(
            'Anexe os documentos obrigatórios do checklist antes de enviar.',
          );
      };
      const allReceived = async () => {
        const sent = (
          await q.query(
            "SELECT id FROM (SELECT DISTINCT ON(requirement_key) id,status FROM documents WHERE case_id=$1 ORDER BY requirement_key,version DESC) latest WHERE status='sent' LIMIT 1",
            [row.id],
          )
        ).rows[0];
        if (sent)
          throw new BadRequestException(
            'Registre o recebimento administrativo de todos os anexos antes de encaminhar.',
          );
      };
      if (step.id === '1') allow(actor, 'applicant');
      if (step.id === '2') {
        // Serialize duplicate checks for this establishment without bypassing tenant RLS.
        await q.query('SELECT id FROM establishments WHERE id=$1 FOR UPDATE', [
          row.establishment_id,
        ]);
        const duplicate = (
          await q.query(
            "SELECT id,protocol FROM cases WHERE establishment_id=$1 AND request_type=$2 AND id<>$3 AND status<>'closed' AND (workflow_step IS NULL OR workflow_step NOT IN ('1','2')) LIMIT 1",
            [row.establishment_id, row.request_type, row.id],
          )
        ).rows[0];
        if (duplicate)
          throw new ConflictException(
            `Já existe requerimento em andamento para este empreendimento: ${duplicate.protocol || duplicate.id}. Confira o histórico antes de abrir outro processo.`,
          );
        if (!row.protocol) {
          const protocol = `SIS-DEMO-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
          const establishment = (
            await q.query('SELECT * FROM establishments WHERE id=$1', [row.establishment_id])
          ).rows[0];
          const { result, snapshot } = await classifyWithQuery(
            q,
            establishment.activity,
            Number(establishment.capacity),
            new Date().toISOString().slice(0, 10),
            establishment.capacity_unit || undefined,
          );
          await q.query(
            'UPDATE cases SET protocol=$1,filed_at=now(),rule_id=$2,rule_snapshot=$3,classification=$4 WHERE id=$5',
            [
              protocol,
              snapshot?.id || null,
              snapshot ? JSON.stringify(snapshot) : null,
              JSON.stringify(result),
              row.id,
            ],
          );
          extra.processNumber = protocol;
        }
      }
      if (step.id === '4' && !b.reference)
        throw new BadRequestException(
          'Informe a referência e a justificativa técnica para a competência, sem presumir enquadramento legal.',
        );
      if (step.id === '4')
        extra.competenceReview = {
          outcome: b.action,
          reference: b.reference,
          note: b.note,
          demonstration: true,
        };
      if (step.id === '6') {
        if (
          row.classification?.manual ||
          !items.length ||
          items.some((i) => i.kind === 'conditional')
        )
          throw new BadRequestException(
            'Revise o enquadramento e resolva o checklist antes de encaminhar.',
          );
      }
      if (['7', '10b', '15_admin', '4a', '19', '21', '22_admin'].includes(step.id))
        extra.communication = {
          step: step.id,
          text: b.note,
          at: new Date().toISOString(),
          by: actor.name,
        };
      if (['10b', '15_admin'].includes(step.id)) extra.responseBaseline = new Date().toISOString();
      if (['8', '10c'].includes(step.id)) allPresent();
      if (['10c', '15b'].includes(step.id)) {
        if (
          !(
            await q.query(
              'SELECT id FROM documents WHERE case_id=$1 AND uploaded_by=$2 AND created_at>$3 LIMIT 1',
              [row.id, actor.id, row.workflow_data.responseBaseline],
            )
          ).rows[0]
        )
          throw new BadRequestException(
            'Envie uma nova versão documental para atender à solicitação administrativa.',
          );
      }
      if (['9', '15_receipt'].includes(step.id)) {
        allPresent();
        await allReceived();
      }
      if ((step.id === '10' && b.action === 'adequate') || step.id === '11') {
        if (blockingItems(items).length || row.classification?.manual)
          throw new BadRequestException(
            'Conclua a revisão técnica de cada documento obrigatório antes de registrar adequação.',
          );
      }
      if (step.id === '12') {
        if (!b.reference || !b.amount)
          throw new BadRequestException(
            'Informe valor e referência da taxa simulada. O sistema não presume valor legal.',
          );
        extra.fee = {
          reference: b.reference,
          amount: b.amount,
          demonstration: true,
          bankSlipIssued: false,
        };
      }
      if (['13', '14'].includes(step.id)) {
        const doc = (
          await q.query(
            "SELECT * FROM documents WHERE case_id=$1 AND requirement_key='extra_pagamento' ORDER BY version DESC LIMIT 1",
            [row.id],
          )
        ).rows[0];
        if (!doc || doc.scan_status === 'quarantine' || (step.id === '14' && !doc.received_at))
          throw new BadRequestException(
            'Anexe o comprovante fictício de pagamento e registre seu recebimento administrativo na etapa 14.',
          );
        extra.payment = { documentId: doc.id, verified: step.id === '14', demonstration: true };
      }
      if (step.id === '15a' && b.action === 'adequate') {
        await allReceived();
        extra.studyReview = { adequate: true, note: b.note };
      }
      if (['17', '24'].includes(step.id)) {
        const inspection = (
          await q.query(
            "INSERT INTO inspections(municipality_id,case_id,inspector_id,title,scheduled_at,status,report) VALUES($1,$2,$3,$4,now(),'completed',$5) RETURNING id",
            [
              actor.municipalityId,
              row.id,
              actor.id,
              step.id === '17'
                ? 'Vistoria técnica — roteiro demonstrativo'
                : 'Vistoria de acompanhamento — roteiro demonstrativo',
              b.note,
            ],
          )
        ).rows[0];
        extra.inspectionId = inspection.id;
      }
      if (step.id === '17')
        extra.inspection = {
          report: b.note,
          authorId: actor.id,
          at: new Date().toISOString(),
          demonstration: true,
        };
      if (['18', '20'].includes(step.id)) {
        const opinion = (
          await q.query('SELECT * FROM opinions WHERE case_id=$1 ORDER BY version DESC LIMIT 1', [
            row.id,
          ])
        ).rows[0];
        const conclusion =
          step.id === '20' || b.action === 'favorable' ? 'favorable' : 'unfavorable';
        if (
          !opinion ||
          opinion.status !== 'reviewed' ||
          (conclusion === 'favorable'
            ? !['favorable', 'favorable_reservations'].includes(opinion.conclusion)
            : opinion.conclusion !== conclusion)
        )
          throw new BadRequestException(
            'Registre e revise um parecer com a conclusão correspondente antes de avançar.',
          );
      }
      if (
        step.id === '21' &&
        !(await q.query('SELECT id FROM licenses WHERE case_id=$1', [row.id])).rows[0]
      )
        throw new BadRequestException(
          'Registre a licença-modelo na aba Licença e condicionantes antes de iniciar acompanhamento.',
        );
      if (
        step.id === '23' &&
        !(
          await q.query(
            "SELECT id FROM documents WHERE case_id=$1 AND requirement_key='extra_relatorio' AND scan_status<>'quarantine' LIMIT 1",
            [row.id],
          )
        ).rows[0]
      )
        throw new BadRequestException('Anexe o relatório periódico demonstrativo antes de enviar.');
      if (step.id === '23_receipt') await allReceived();
      if (step.id === '19' && b.action === 'archive')
        await q.query(
          "UPDATE cases SET decision_outcome='refused_demo',decision_reason=$1,decided_by=$2,decided_at=now() WHERE id=$3",
          [b.note, actor.id, row.id],
        );
      return advanceWorkflow(q, actor, row, b.action, b.note, extra);
    });
  }
}
@Controller('cases')
@UseGuards(AuthGuard)
export class CasesController {
  constructor(@Inject(CasesService) readonly service: CasesService) {}
  @Post(':id/workflow/start') startWorkflow(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.startWorkflow(r.actor, id, b);
  }
  @Post(':id/workflow') workflow(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.workflow(r.actor, id, b);
  }
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
