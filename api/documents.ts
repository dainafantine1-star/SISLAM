import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  Inject,
  Injectable,
  Module,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { put as putBlob, get as getBlob } from '@vercel/blob';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  Database,
  AuthGuard,
  type AuthRequest,
  type Actor,
  allow,
  audit,
  id,
  digest,
  encrypt,
  decrypt,
  dataDirectory,
  DEMO,
  readRoles,
} from './core';
import { caseRow } from './cases';
import { requireWorkflowStep } from './municipal-workflow';
@Injectable()
export class FileStore {
  private client?: S3Client;
  private s3() {
    return (this.client ??= new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    }));
  }
  async put(key: string, data: Buffer) {
    const encrypted = encrypt(data);
    if (process.env.S3_BUCKET) {
      await this.s3().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: encrypted,
          ContentType: 'application/octet-stream',
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
    } else if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      await putBlob(key, encrypted, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/octet-stream',
      });
    } else {
      if (process.env.VERCEL)
        throw new BadRequestException('Armazenamento persistente de anexos não configurado');
      if (!DEMO()) throw new BadRequestException('Armazenamento operacional não configurado');
      const directory = path.join(dataDirectory(), 'files');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, key), encrypted, { flag: 'wx' });
    }
  }
  async get(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key))
      throw new BadRequestException('Identificador do arquivo inválido');
    let data: Buffer;
    if (process.env.S3_BUCKET) {
      const result = await this.s3().send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      data = Buffer.from(await result.Body!.transformToByteArray());
    } else if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      const result = await getBlob(key, { access: 'private' });
      if (!result || result.statusCode !== 200)
        throw new NotFoundException('Arquivo não encontrado');
      data = Buffer.from(await new Response(result.stream).arrayBuffer());
    } else {
      if (process.env.VERCEL)
        throw new BadRequestException('Armazenamento persistente de anexos não configurado');
      data = await fs.readFile(path.join(dataDirectory(), 'files', key));
    }
    return decrypt(data);
  }
  async scan(data: Buffer): Promise<'clean' | 'quarantine' | 'demo_unscanned'> {
    if (!process.env.ANTIVIRUS_URL) return DEMO() ? 'demo_unscanned' : 'quarantine';
    try {
      const url = new URL(process.env.ANTIVIRUS_URL);
      if (!['http:', 'https:'].includes(url.protocol)) return 'quarantine';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(data),
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return 'quarantine';
      const result = await response.json();
      return result.status === 'clean' ? 'clean' : 'quarantine';
    } catch {
      return 'quarantine';
    }
  }
}
const uploadLimitMB = process.env.VERCEL ? 3 : 10;
const uploadLimit = uploadLimitMB * 1024 * 1024;
export function validateFile(file: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}) {
  if (!file || !file.buffer?.length || file.buffer.length > uploadLimit)
    throw new BadRequestException(`Envie um arquivo de até ${uploadLimitMB} MB`);
  const data = file.buffer;
  const detected =
    data.subarray(0, 5).toString() === '%PDF-'
      ? 'application/pdf'
      : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : data[0] === 255 && data[1] === 216 && data[2] === 255
          ? 'image/jpeg'
          : null;
  if (!detected || detected !== file.mimetype)
    throw new BadRequestException('O conteúdo não corresponde a um PDF, PNG ou JPEG permitido');
  return {
    mediaType: detected,
    filename:
      path
        .basename(file.originalname.replaceAll('\\', '/'))
        .replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 180) || 'documento',
  };
}
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(FileStore) readonly files: FileStore,
  ) {}
  async upload(actor: Actor, caseId: string, requirementKey: string, file: Express.Multer.File) {
    allow(actor, 'applicant', 'protocol');
    const valid = validateFile(file);
    z.string()
      .regex(/^[a-z0-9_-]{2,60}$/)
      .parse(requirementKey);
    return this.db.tenant(actor, async (q) => {
      const row = await caseRow(q, caseId, true);
      if (!requirementKey.startsWith('evidence_'))
        requireWorkflowStep(row, ['8', '10c', '13', '15b', '23']);
      if (
        row.status === 'closed' &&
        !requirementKey.startsWith('evidence_') &&
        !(row.workflow_step === '23' && requirementKey === 'extra_relatorio')
      )
        throw new BadRequestException('O processo está encerrado');
      const configured = (row.classification?.requirements || []).some(
        (r: any) => r.key === requirementKey,
      );
      if (
        !configured &&
        !requirementKey.startsWith('evidence_') &&
        !requirementKey.startsWith('extra_')
      )
        throw new BadRequestException('Este item não pertence ao checklist do processo');
      const version = Number(
          (
            await q.query(
              'SELECT coalesce(max(version),0)+1 AS next FROM documents WHERE case_id=$1 AND requirement_key=$2',
              [row.id, requirementKey],
            )
          ).rows[0].next,
        ),
        key = randomUUID(),
        sha = digest(file.buffer),
        scan = await this.files.scan(file.buffer);
      await this.files.put(key, file.buffer);
      const saved = (
        await q.query(
          'INSERT INTO documents(municipality_id,case_id,requirement_key,version,filename,media_type,bytes,sha256,storage_key,scan_status,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,version,filename,sha256,scan_status,status,created_at',
          [
            actor.municipalityId,
            row.id,
            requirementKey,
            version,
            valid.filename,
            valid.mediaType,
            file.buffer.length,
            sha,
            key,
            scan,
            actor.id,
          ],
        )
      ).rows[0];
      await audit(
        q,
        actor,
        'document.uploaded',
        {
          documentId: saved.id,
          requirementKey,
          version,
          filename: valid.filename,
          sha256: sha,
          scanStatus: scan,
        },
        row.id,
      );
      const updatedCase = (
        await q.query(
          'UPDATE cases SET updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING revision',
          [row.id],
        )
      ).rows[0];
      return {
        ...saved,
        caseRevision: updatedCase.revision,
        receipt: `REC-${saved.id}`,
        notice:
          scan === 'demo_unscanned'
            ? 'Arquivo demonstrativo: antivírus não executado.'
            : scan === 'quarantine'
              ? 'Arquivo em quarentena.'
              : undefined,
      };
    });
  }
  receive(actor: Actor, documentId: string) {
    allow(actor, 'protocol');
    return this.db.tenant(actor, async (q) => {
      const row = (
        await q.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id(documentId)])
      ).rows[0];
      if (!row) throw new NotFoundException('Documento não encontrado');
      const process = await caseRow(q, row.case_id, true);
      requireWorkflowStep(process, [
        '9',
        '14',
        '15_receipt',
        '23_receipt',
        '22',
        '24',
        '25',
        'renewal_ready',
      ]);
      if (row.status !== 'sent')
        throw new BadRequestException('Este documento já recebeu conferência administrativa');
      if (row.scan_status === 'quarantine')
        throw new BadRequestException('O arquivo está em quarentena');
      const saved = (
        await q.query(
          "UPDATE documents SET status='received',received_by=$1,received_at=now() WHERE id=$2 RETURNING id,status,received_at",
          [actor.id, row.id],
        )
      ).rows[0];
      await audit(
        q,
        actor,
        'document.received',
        { documentId: row.id, sha256: row.sha256 },
        row.case_id,
      );
      return saved;
    });
  }
  review(actor: Actor, documentId: string, input: unknown) {
    allow(actor, 'analyst');
    const b = z
      .object({
        status: z.enum(['accepted', 'reservation', 'rejected']),
        note: z.string().trim().min(8).max(3000),
      })
      .parse(input);
    return this.db.tenant(actor, async (q) => {
      const row = (
        await q.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE', [id(documentId)])
      ).rows[0];
      if (!row) throw new NotFoundException('Documento não encontrado');
      const process = await caseRow(q, row.case_id, true);
      requireWorkflowStep(process, ['10', '15a', '22', '24', '25', 'renewal_ready']);
      if (row.status !== 'received')
        throw new BadRequestException(
          'O recebimento administrativo deve preceder a análise técnica',
        );
      if (row.scan_status === 'quarantine' || (!DEMO() && row.scan_status !== 'clean'))
        throw new BadRequestException('A validação antimalware está pendente');
      await q.query(
        'UPDATE documents SET status=$1,reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$4',
        [b.status, actor.id, b.note, row.id],
      );
      await audit(
        q,
        actor,
        'document.reviewed',
        { documentId: row.id, status: b.status, note: b.note },
        row.case_id,
      );
      return { ok: true };
    });
  }
  async download(actor: Actor, documentId: string) {
    allow(actor, ...readRoles);
    const row = await this.db.tenant(
      actor,
      async (q) => (await q.query('SELECT * FROM documents WHERE id=$1', [id(documentId)])).rows[0],
    );
    if (!row) throw new NotFoundException('Documento não encontrado');
    if (row.scan_status === 'quarantine')
      throw new BadRequestException('O arquivo está em quarentena');
    const data = await this.files.get(row.storage_key);
    if (digest(data) !== row.sha256)
      throw new BadRequestException('Falha de integridade do documento. Download bloqueado.');
    return { row, data };
  }
}
@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) readonly service: DocumentsService) {}
  @Get() list(@Req() r: AuthRequest) {
    allow(r.actor, ...readRoles);
    return this.service.db.tenant(
      r.actor,
      async (q) =>
        (
          await q.query(
            'SELECT d.id,d.case_id,d.requirement_key,d.version,d.filename,d.media_type,d.bytes,d.sha256,d.scan_status,d.status,d.received_at,d.reviewed_at,d.review_note,d.created_at,c.protocol,c.workflow_step FROM documents d JOIN cases c ON c.id=d.case_id ORDER BY d.created_at DESC LIMIT 500',
          )
        ).rows,
    );
  }
  @Post('cases/:id')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: uploadLimit, files: 1, fields: 1 } }),
  )
  upload(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body('requirementKey') key: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.upload(r.actor, id, key, file);
  }
  @Post(':id/receive') receive(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.receive(r.actor, id);
  }
  @Post(':id/review') review(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.review(r.actor, id, b);
  }
  @Get(':id/download') async download(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { row, data } = await this.service.download(r.actor, id);
    response.setHeader('Content-Type', row.media_type);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    );
    response.send(data);
  }
}
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, FileStore],
  exports: [DocumentsService, FileStore],
})
export class DocumentsModule {}
