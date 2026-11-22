import fs from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { Database, encrypt, decrypt, digest, dataDirectory, type Query } from './core';
import { FileStore } from './documents';
const tables = [
  'municipalities',
  'users',
  'memberships',
  'sessions',
  'rate_limits',
  'organizations',
  'establishments',
  'rule_versions',
  'cases',
  'documents',
  'opinions',
  'licenses',
  'conditions',
  'notices',
  'complaints',
  'complaint_contacts',
  'inspections',
  'support_grants',
  'audit_heads',
  'audit_events',
  'outbox',
  'holidays',
  'schema_migrations',
] as const;
type Snapshot = {
  format: 'sislam-backup-v1';
  createdAt: string;
  schemaHash: string;
  tables: { name: string; documents: string[]; sha256: string }[];
  files: { key: string; content: string; sha256: string }[];
};
const schema = () =>
  readdirSync('db')
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()
    .map((f) => readFileSync(path.join('db', f), 'utf8'))
    .join('\n');
export async function capture(db: Database, files: FileStore): Promise<Snapshot> {
  const snapshot: Snapshot = {
    format: 'sislam-backup-v1',
    createdAt: new Date().toISOString(),
    schemaHash: digest(schema()),
    tables: [],
    files: [],
  };
  await db.system(async (q) => {
    await q.query("SET LOCAL timezone='UTC'");
    for (const table of tables) {
      const order = table === 'cases' ? 'created_at,id' : 'to_jsonb(t)::text';
      const documents = (
        await q.query(`SELECT to_jsonb(t)::text AS document FROM "${table}" t ORDER BY ${order}`)
      ).rows.map((r) => r.document);
      snapshot.tables.push({ name: table, documents, sha256: digest(documents.join('\n')) });
    }
    const documents = (await q.query('SELECT storage_key,sha256 FROM documents')).rows;
    for (const row of documents) {
      const content = await files.get(row.storage_key);
      if (digest(content) !== row.sha256) throw Error('Integridade do arquivo não confere');
      snapshot.files.push({
        key: row.storage_key,
        content: content.toString('base64'),
        sha256: row.sha256,
      });
    }
  });
  return snapshot;
}
export const encodeBackup = (snapshot: Snapshot) =>
  encrypt(gzipSync(Buffer.from(JSON.stringify(snapshot))));
export function decodeBackup(data: Buffer): Snapshot {
  const snapshot = JSON.parse(
    gunzipSync(decrypt(data), { maxOutputLength: 512 * 1024 * 1024 }).toString(),
  ) as Snapshot;
  if (snapshot.format !== 'sislam-backup-v1' || snapshot.schemaHash !== digest(schema()))
    throw Error('Formato ou versão do esquema incompatível');
  if (
    snapshot.tables.length !== tables.length ||
    new Set(snapshot.tables.map((t) => t.name)).size !== tables.length
  )
    throw Error('Manifesto de tabelas inválido');
  for (const t of snapshot.tables)
    if (
      !tables.includes(t.name as (typeof tables)[number]) ||
      t.sha256 !== digest(t.documents.join('\n'))
    )
      throw Error('Checksum de tabela inválido');
  for (const f of snapshot.files)
    if (!/^[a-f0-9-]{36}$/.test(f.key) || digest(Buffer.from(f.content, 'base64')) !== f.sha256)
      throw Error('Checksum de arquivo inválido');
  return snapshot;
}
export async function restoreInto(q: Query, snapshot: Snapshot) {
  await q.query("SET timezone='UTC'");
  for (const name of tables) {
    const table = snapshot.tables.find((t) => t.name === name)!;
    for (const document of table.documents)
      await q.query(
        `INSERT INTO "${name}" SELECT * FROM jsonb_populate_record(NULL::"${name}",$1::jsonb)`,
        [document],
      );
  }
}
export async function verifyBackup(snapshot: Snapshot) {
  const recovery = new PGlite();
  try {
    await recovery.exec(schema());
    await recovery.exec(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await recovery.exec('BEGIN');
    await restoreInto(recovery as Query, snapshot);
    for (const table of snapshot.tables) {
      const order = table.name === 'cases' ? 'created_at,id' : 'to_jsonb(t)::text';
      const documents = (
        await recovery.query<{ document: string }>(
          `SELECT to_jsonb(t)::text AS document FROM "${table.name}" t ORDER BY ${order}`,
        )
      ).rows.map((r) => r.document);
      if (digest(documents.join('\n')) !== table.sha256)
        throw Error('Falha na restauração de ' + table.name);
    }
    await recovery.exec('COMMIT');
    return { verified: true, tables: snapshot.tables.length, files: snapshot.files.length };
  } finally {
    await recovery.close();
  }
}
