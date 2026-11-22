import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  Inject,
  Module,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  Database,
  AuthGuard,
  type AuthRequest,
  type Actor,
  type Query,
  allow,
  audit,
  id,
  readRoles,
  DEMO,
  encrypt,
} from './core';
import { caseRow, checklist, blockingItems } from './cases';
export function dueDate(
  start: string,
  days: number,
  counting: 'calendar' | 'business',
  holidays: string[] = [],
) {
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new BadRequestException('Prazo inválido');
  const d = new Date(start + 'T12:00:00Z');
  let n = 0;
  while (n < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);
    if (
      counting === 'calendar' ||
      (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.includes(date))
    )
      n++;
  }
  return d.toISOString().slice(0, 10);
}
export async function licensePdf(row: any) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]),
    y = 780;
  const safe = (s: string) => s.replace(/[^\x20-\xff\n]/g, ' ');
  function line(text: string, size = 11, strong = false) {
    for (const chunk of safe(text).match(/.{1,90}(?:\s|$)|.{1,90}/g) || ['']) {
      if (y < 90) {
        page = pdf.addPage([595, 842]);
        y = 780;
      }
      page.drawText(chunk.trim(), {
        x: 48,
        y,
        size,
        font: strong ? bold : font,
        color: rgb(0.1, 0.22, 0.18),
      });
      y -= size + 7;
    }
  }
  line('SISLAM | GESTAO AMBIENTAL', 18, true);
  line('DEMONSTRACAO - SEM VALIDADE JURIDICA', 14, true);
  y -= 14;
  line(row.number, 16, true);
  line(`Municipio: ${row.municipality_name || 'Municipio demonstrativo'}`);
  line(`Processo: ${row.protocol || row.case_id}`);
  line(`Vigencia demonstrativa ate: ${new Date(row.valid_until).toISOString().slice(0, 10)}`);
  line(`Estado: ${row.status}`);
  y -= 18;
  for (const paragraph of row.text.split('\n')) line(paragraph);
  y -= 10;
  line('Aprovacao registrada por usuario autorizado para simulacao.');
  line('Nao representa assinatura eletronica oficial nem ato administrativo.');
  line(`Codigo de verificacao: ${row.verification_code}`, 9);
  const url =
      (process.env.WEB_ORIGIN || 'http://localhost:3400') + '/verificar/' + row.verification_code,
    qr = await QRCode.toDataURL(url, { width: 120, margin: 1 }),
    png = await pdf.embedPng(qr);
  if (y < 190) {
    page = pdf.addPage([595, 842]);
    y = 780;
  }
  page.drawImage(png, { x: 48, y: y - 115, width: 100, height: 100 });
  return Buffer.from(await pdf.save());
}
@Controller()
@UseGuards(AuthGuard)
export class MonitoringController {
  constructor(@Inject(Database) readonly db: Database) {}
  @Post('cases/:id/refuse') refuse(
    @Req() r: AuthRequest,
    @Param('id') caseId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'authority');
    const b = z
      .object({ reason: z.string().trim().min(30).max(5000), confirmed: z.literal(true) })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (row.status !== 'decision')
        throw new BadRequestException('O processo precisa estar na etapa de decisão');
      const opinion = (
        await q.query('SELECT * FROM opinions WHERE case_id=$1 ORDER BY version DESC LIMIT 1', [
          row.id,
        ])
      ).rows[0];
      if (!opinion || opinion.status !== 'reviewed' || opinion.author_id === r.actor.id)
        throw new BadRequestException('É necessário parecer revisado por outro agente');
      if ((await q.query('SELECT id FROM licenses WHERE case_id=$1', [row.id])).rows[0])
        throw new BadRequestException(
          'Já existe licença-modelo; use um procedimento de revisão do ato',
        );
      await q.query(
        "UPDATE cases SET status='closed',decision_outcome='refused_demo',decision_reason=$1,decided_by=$2,decided_at=now(),revision=revision+1,updated_at=now() WHERE id=$3",
        [b.reason, r.actor.id, row.id],
      );
      await audit(
        q,
        r.actor,
        'case.refused_demo',
        { reason: b.reason, opinionId: opinion.id },
        row.id,
      );
      return { ok: true, officialDecision: false };
    });
  }
  @Get('licenses') licenses(@Req() r: AuthRequest) {
    allow(r.actor, ...readRoles);
    return this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT l.*,c.protocol,e.name AS establishment_name FROM licenses l JOIN cases c ON c.id=l.case_id JOIN establishments e ON e.id=c.establishment_id ORDER BY l.approved_at DESC LIMIT 500',
          )
        ).rows,
    );
  }
  @Post('cases/:id/license') issue(
    @Req() r: AuthRequest,
    @Param('id') caseId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'authority');
    const b = z
      .object({
        validUntil: z.iso.date(),
        text: z.string().trim().min(30).max(30000),
        confirmed: z.literal(true),
      })
      .parse(input);
    if (!DEMO())
      throw new BadRequestException(
        'A emissão oficial depende de regras homologadas e provedor de assinatura. Este fluxo emite somente modelos demonstrativos.',
      );
    if (b.validUntil <= new Date().toISOString().slice(0, 10))
      throw new BadRequestException('Informe uma data de validade futura');
    return this.db.tenant(r.actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (row.status !== 'decision')
        throw new BadRequestException('O processo deve estar na etapa de decisão');
      if (row.classification?.manual || blockingItems(await checklist(q, row)).length)
        throw new BadRequestException('Existem pendências impeditivas');
      const opinion = (
        await q.query('SELECT * FROM opinions WHERE case_id=$1 ORDER BY version DESC LIMIT 1', [
          row.id,
        ])
      ).rows[0];
      if (!opinion || opinion.status !== 'reviewed' || opinion.conclusion !== 'favorable')
        throw new BadRequestException('É necessário parecer favorável revisado');
      if (opinion.author_id === r.actor.id)
        throw new ForbiddenException(
          'A autoridade decisora deve ser diferente do autor do parecer',
        );
      const number = `LIC-DEMO-${new Date().getUTCFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        code = randomBytes(20).toString('hex');
      const saved = (
        await q.query(
          'INSERT INTO licenses(municipality_id,case_id,opinion_id,authority_id,number,verification_code,text,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            r.actor.municipalityId,
            row.id,
            opinion.id,
            r.actor.id,
            number,
            code,
            b.text,
            b.validUntil,
          ],
        )
      ).rows[0];
      await audit(
        q,
        r.actor,
        'license.approved_demo',
        {
          licenseId: saved.id,
          number,
          opinionId: opinion.id,
          validUntil: b.validUntil,
          officialSignature: false,
        },
        row.id,
      );
      await q.query('UPDATE cases SET revision=revision+1,updated_at=now() WHERE id=$1', [row.id]);
      return saved;
    });
  }
  @Post('licenses/:id/publish') publish(@Req() r: AuthRequest, @Param('id') licenseId: string) {
    allow(r.actor, 'authority');
    return this.db.tenant(r.actor, async (q) => {
      const row = (await q.query('SELECT * FROM licenses WHERE id=$1 FOR UPDATE', [id(licenseId)]))
        .rows[0];
      if (!row) throw new NotFoundException('Modelo de licença não encontrado');
      if (row.status !== 'approved_demo')
        throw new BadRequestException('O modelo já foi publicado ou encerrado');
      await q.query("UPDATE licenses SET status='published_demo',published_at=now() WHERE id=$1", [
        row.id,
      ]);
      await audit(
        q,
        r.actor,
        'license.published_demo',
        { licenseId: row.id, officialPublication: false },
        row.case_id,
      );
      return { ok: true, verificationUrl: '/verificar/' + row.verification_code };
    });
  }
  @Get('licenses/:id/pdf') async pdf(
    @Req() r: AuthRequest,
    @Param('id') licenseId: string,
    @Res() res: Response,
  ) {
    allow(r.actor, ...readRoles);
    const row = await this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT l.*,c.protocol,m.name AS municipality_name FROM licenses l JOIN cases c ON c.id=l.case_id JOIN municipalities m ON m.id=l.municipality_id WHERE l.id=$1',
            [id(licenseId)],
          )
        ).rows[0],
    );
    if (!row) throw new NotFoundException('Licença não encontrada');
    res
      .type('application/pdf')
      .attachment(row.number + '.pdf')
      .send(await licensePdf(row));
  }
  @Get('conditions') conditions(@Req() r: AuthRequest) {
    allow(r.actor, ...readRoles);
    return this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT d.*,c.protocol,l.number AS license_number,e.name AS establishment_name FROM conditions d JOIN cases c ON c.id=d.case_id JOIN licenses l ON l.id=d.license_id JOIN establishments e ON e.id=c.establishment_id ORDER BY d.due_date LIMIT 500',
          )
        ).rows,
    );
  }
  @Post('licenses/:id/conditions') addCondition(
    @Req() r: AuthRequest,
    @Param('id') licenseId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'authority');
    const b = z
      .object({
        title: z.string().trim().min(8).max(1000),
        responsible: z.string().trim().min(3).max(160),
        dueDate: z.iso.date(),
      })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const license = (await q.query('SELECT * FROM licenses WHERE id=$1', [id(licenseId)]))
        .rows[0];
      if (!license) throw new NotFoundException('Licença não encontrada');
      const saved = (
        await q.query(
          'INSERT INTO conditions(municipality_id,license_id,case_id,title,responsible,due_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [r.actor.municipalityId, license.id, license.case_id, b.title, b.responsible, b.dueDate],
        )
      ).rows[0];
      await audit(
        q,
        r.actor,
        'condition.created',
        { conditionId: saved.id, title: b.title, dueDate: b.dueDate },
        license.case_id,
      );
      return saved;
    });
  }
  @Post('conditions/:id/evidence') evidence(
    @Req() r: AuthRequest,
    @Param('id') conditionId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'applicant', 'protocol');
    const b = z.object({ documentId: z.uuid() }).parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const condition = (
        await q.query('SELECT * FROM conditions WHERE id=$1 FOR UPDATE', [id(conditionId)])
      ).rows[0];
      if (!condition) throw new NotFoundException('Condicionante não encontrada');
      const document = (
        await q.query('SELECT * FROM documents WHERE id=$1 AND case_id=$2', [
          b.documentId,
          condition.case_id,
        ])
      ).rows[0];
      if (
        !document ||
        document.requirement_key !== 'evidence_' + condition.id.replaceAll('-', '') ||
        document.scan_status === 'quarantine'
      )
        throw new BadRequestException('Selecione um anexo deste processo sem quarentena');
      if (condition.status === 'fulfilled')
        throw new BadRequestException('A condicionante já foi cumprida');
      await q.query(
        "UPDATE conditions SET evidence_document_id=$1,status='submitted' WHERE id=$2",
        [document.id, condition.id],
      );
      await audit(
        q,
        r.actor,
        'condition.evidence_submitted',
        { conditionId: condition.id, documentId: document.id },
        condition.case_id,
      );
      return { ok: true };
    });
  }
  @Post('conditions/:id/review') reviewCondition(
    @Req() r: AuthRequest,
    @Param('id') conditionId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'analyst', 'inspector');
    const b = z
      .object({
        status: z.enum(['fulfilled', 'rejected']),
        note: z.string().trim().min(8).max(2000),
      })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const row = (
        await q.query('SELECT * FROM conditions WHERE id=$1 FOR UPDATE', [id(conditionId)])
      ).rows[0];
      if (!row) throw new NotFoundException('Condicionante não encontrada');
      if (row.status !== 'submitted' || !row.evidence_document_id)
        throw new BadRequestException('É necessário receber comprovação antes da análise');
      await q.query('UPDATE conditions SET status=$1,review_note=$2 WHERE id=$3', [
        b.status,
        b.note,
        row.id,
      ]);
      await audit(q, r.actor, 'condition.reviewed', { conditionId: row.id, ...b }, row.case_id);
      return { ok: true };
    });
  }
  @Get('notices') notices(@Req() r: AuthRequest) {
    allow(r.actor, ...readRoles);
    return this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT n.*,c.protocol FROM notices n JOIN cases c ON c.id=n.case_id ORDER BY n.created_at DESC LIMIT 500',
          )
        ).rows,
    );
  }
  @Post('cases/:id/notices') notice(
    @Req() r: AuthRequest,
    @Param('id') caseId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'analyst', 'protocol');
    const b = z
      .object({
        title: z.string().min(5).max(200),
        text: z.string().min(20).max(15000),
        days: z.number().int().min(1).max(3650),
        counting: z.enum(['calendar', 'business']),
        deadlineBasis: z.string().trim().min(12).max(2000),
      })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const row = await caseRow(q, caseId);
      const saved = (
        await q.query(
          'INSERT INTO notices(municipality_id,case_id,author_id,title,text,days,counting,deadline_basis) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            r.actor.municipalityId,
            row.id,
            r.actor.id,
            b.title,
            b.text,
            b.days,
            b.counting,
            b.deadlineBasis,
          ],
        )
      ).rows[0];
      await audit(
        q,
        r.actor,
        'notice.draft_created',
        { noticeId: saved.id, days: b.days, counting: b.counting, basis: b.deadlineBasis },
        row.id,
      );
      return saved;
    });
  }
  @Post('notices/:id/action') noticeAction(
    @Req() r: AuthRequest,
    @Param('id') noticeId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'authority', 'protocol');
    const b = z
      .object({
        action: z.enum(['approve', 'dispatch_demo', 'acknowledge_demo', 'answer']),
        evidence: z.string().max(2000).optional(),
        acknowledgedAt: z.iso.datetime().optional(),
      })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const row = (await q.query('SELECT * FROM notices WHERE id=$1 FOR UPDATE', [id(noticeId)]))
        .rows[0];
      if (!row) throw new NotFoundException('Notificação não encontrada');
      if (b.action === 'approve') {
        allow(r.actor, 'authority');
        if (row.status !== 'draft')
          throw new BadRequestException('A minuta não está disponível para aprovação');
        await q.query("UPDATE notices SET status='approved',approved_by=$1 WHERE id=$2", [
          r.actor.id,
          row.id,
        ]);
      } else if (b.action === 'dispatch_demo') {
        if (!DEMO())
          throw new BadRequestException(
            'Configure o canal oficial de comunicação antes de expedir',
          );
        if (row.status !== 'approved')
          throw new BadRequestException('Aprovação da autoridade é obrigatória');
        await q.query(
          "UPDATE notices SET status='dispatched_demo',dispatched_at=now() WHERE id=$1",
          [row.id],
        );
        await q.query(
          "INSERT INTO outbox(municipality_id,event_key,kind,payload,status) VALUES($1,$2,'notice.dispatch_demo',$3,'simulated') ON CONFLICT(event_key) DO NOTHING",
          [
            r.actor.municipalityId,
            'notice:' + row.id,
            JSON.stringify({ noticeId: row.id, emailSent: false }),
          ],
        );
      } else if (b.action === 'acknowledge_demo') {
        if (
          !DEMO() ||
          row.status !== 'dispatched_demo' ||
          !b.evidence ||
          b.evidence.trim().length < 10 ||
          !b.acknowledgedAt
        )
          throw new BadRequestException(
            'Informe a evidência e o instante da ciência demonstrativa após a expedição',
          );
        const at = new Date(b.acknowledgedAt);
        if (at > new Date() || at < new Date(row.dispatched_at))
          throw new BadRequestException(
            'O instante deve estar entre a expedição e o momento atual',
          );
        const holidays = (
            await q.query("SELECT to_char(date,'YYYY-MM-DD') AS date FROM holidays")
          ).rows.map((h) => h.date),
          start = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(at),
          due = dueDate(start, row.days, row.counting, holidays);
        await q.query(
          "UPDATE notices SET status='acknowledged_demo',acknowledged_at=$1,acknowledgement_evidence=$2,due_date=$3 WHERE id=$4",
          [at, b.evidence, due, row.id],
        );
      } else {
        if (row.status !== 'acknowledged_demo')
          throw new BadRequestException('A notificação ainda não tem ciência registrada');
        await q.query("UPDATE notices SET status='answered' WHERE id=$1", [row.id]);
      }
      await audit(
        q,
        r.actor,
        'notice.' + b.action,
        {
          noticeId: row.id,
          evidence: b.evidence || null,
          acknowledgedAt: b.acknowledgedAt || null,
        },
        row.case_id,
      );
      return { ok: true, emailSent: false };
    });
  }
  @Get('complaints') complaints(@Req() r: AuthRequest) {
    allow(r.actor, 'ombudsman', 'inspector', 'authority');
    return this.db.tenant(
      r.actor,
      async (q) =>
        (await q.query('SELECT * FROM complaints ORDER BY updated_at DESC LIMIT 500')).rows,
    );
  }
  @Post('complaints') complaint(@Req() r: AuthRequest, @Body() input: unknown) {
    allow(r.actor, 'ombudsman');
    const b = z
      .object({
        title: z.string().min(5).max(200),
        narrative: z.string().min(20).max(12000),
        location: z.string().min(5).max(500),
        contact: z.string().max(500).optional(),
        caseId: z.uuid().nullable().optional(),
      })
      .parse(input);
    return this.db.tenant(r.actor, async (q) => {
      if (b.caseId) await caseRow(q, b.caseId);
      const protocol =
          'DEN-' + new Date().getUTCFullYear() + '-' + randomBytes(4).toString('hex').toUpperCase(),
        row = (
          await q.query(
            'INSERT INTO complaints(municipality_id,protocol,title,narrative,location,case_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [
              r.actor.municipalityId,
              protocol,
              b.title,
              b.narrative,
              b.location,
              b.caseId || null,
              r.actor.id,
            ],
          )
        ).rows[0];
      if (b.contact?.trim())
        await q.query(
          'INSERT INTO complaint_contacts(municipality_id,complaint_id,encrypted_contact) VALUES($1,$2,$3)',
          [r.actor.municipalityId, row.id, encrypt(b.contact).toString('base64')],
        );
      await audit(q, r.actor, 'complaint.received', {
        complaintId: row.id,
        protocol,
        identified: Boolean(b.contact?.trim()),
      });
      return row;
    });
  }
  @Post('complaints/:id/transition') complaintTransition(
    @Req() r: AuthRequest,
    @Param('id') complaintId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'ombudsman', 'inspector', 'authority');
    const b = z
        .object({
          to: z.enum(['screening', 'diligence', 'investigation', 'concluded', 'archived']),
          reason: z.string().trim().min(15).max(4000),
        })
        .parse(input),
      graph: Record<string, string[]> = {
        received: ['screening'],
        screening: ['diligence', 'investigation'],
        diligence: ['investigation'],
        investigation: ['concluded'],
        concluded: ['archived'],
        archived: [],
      };
    return this.db.tenant(r.actor, async (q) => {
      const row = (
        await q.query('SELECT * FROM complaints WHERE id=$1 FOR UPDATE', [id(complaintId)])
      ).rows[0];
      if (!row) throw new NotFoundException('Denúncia não encontrada');
      if (!graph[row.status]?.includes(b.to))
        throw new BadRequestException('Transição de denúncia não permitida');
      await q.query(
        "UPDATE complaints SET status=$1,conclusion=CASE WHEN $1 IN ('concluded','archived') THEN $2 ELSE conclusion END,updated_at=now() WHERE id=$3",
        [b.to, b.reason, row.id],
      );
      await audit(q, r.actor, 'complaint.transition', {
        complaintId: row.id,
        from: row.status,
        to: b.to,
        reason: b.reason,
      });
      return { ok: true };
    });
  }
  @Get('inspections') inspections(@Req() r: AuthRequest) {
    allow(r.actor, 'analyst', 'inspector', 'authority');
    return this.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT i.*,c.protocol FROM inspections i LEFT JOIN cases c ON c.id=i.case_id ORDER BY scheduled_at DESC LIMIT 500',
          )
        ).rows,
    );
  }
  @Post('inspections') inspection(@Req() r: AuthRequest, @Body() input: unknown) {
    allow(r.actor, 'inspector', 'authority');
    const b = z
      .object({
        title: z.string().min(5).max(200),
        scheduledAt: z.iso.datetime(),
        caseId: z.uuid().nullable(),
        complaintId: z.uuid().nullable(),
      })
      .parse(input);
    if (!b.caseId && !b.complaintId)
      throw new BadRequestException('Vincule um processo ou denúncia');
    return this.db.tenant(r.actor, async (q) => {
      if (b.caseId) await caseRow(q, b.caseId);
      if (
        b.complaintId &&
        !(await q.query('SELECT id FROM complaints WHERE id=$1', [b.complaintId])).rows[0]
      )
        throw new NotFoundException('Denúncia não encontrada');
      const row = (
        await q.query(
          'INSERT INTO inspections(municipality_id,title,scheduled_at,case_id,complaint_id,inspector_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [r.actor.municipalityId, b.title, b.scheduledAt, b.caseId, b.complaintId, r.actor.id],
        )
      ).rows[0];
      await audit(
        q,
        r.actor,
        'inspection.scheduled',
        { inspectionId: row.id, title: b.title },
        b.caseId || undefined,
      );
      return row;
    });
  }
  @Post('inspections/:id/report') report(
    @Req() r: AuthRequest,
    @Param('id') inspectionId: string,
    @Body() input: unknown,
  ) {
    allow(r.actor, 'inspector');
    const b = z.object({ report: z.string().trim().min(30).max(15000) }).parse(input);
    return this.db.tenant(r.actor, async (q) => {
      const row = (
        await q.query('SELECT * FROM inspections WHERE id=$1 FOR UPDATE', [id(inspectionId)])
      ).rows[0];
      if (!row) throw new NotFoundException('Vistoria não encontrada');
      if (row.status !== 'scheduled')
        throw new BadRequestException('A vistoria já foi concluída ou cancelada');
      await q.query("UPDATE inspections SET status='completed',report=$1 WHERE id=$2", [
        b.report,
        row.id,
      ]);
      await audit(
        q,
        r.actor,
        'inspection.completed',
        { inspectionId: row.id, report: b.report },
        row.case_id || undefined,
      );
      return { ok: true };
    });
  }
}
@Controller('public')
export class PublicController {
  constructor(@Inject(Database) readonly db: Database) {}
  @Get('license/:code') async verify(@Param('code') code: string) {
    z.string()
      .regex(/^[a-f0-9]{40}$/)
      .parse(code);
    const row = await this.db.system(
      async (q) =>
        (
          await q.query(
            "SELECT l.number,l.status,l.valid_until,l.published_at,m.name AS municipality FROM licenses l JOIN municipalities m ON m.id=l.municipality_id WHERE l.verification_code=$1 AND l.status='published_demo'",
            [code],
          )
        ).rows[0],
    );
    if (!row) throw new NotFoundException('Documento não localizado ou ainda não publicado');
    return {
      ...row,
      demonstration: true,
      officialValidity: false,
      message: 'Modelo demonstrativo, sem validade jurídica e sem assinatura oficial.',
    };
  }
}
@Module({ controllers: [MonitoringController, PublicController] })
export class MonitoringModule {}
