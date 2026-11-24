import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FileStore } from '../api/documents';
import { Database, decrypt, encrypt } from '../api/core';
import { get, put } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('persistência da demonstração online', () => {
  it('envia conteúdo cifrado para armazenamento privado sem sobrescrita', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only');
    const key = randomUUID(),
      original = Buffer.from('%PDF- documento fictício');
    vi.mocked(put).mockResolvedValue({} as Awaited<ReturnType<typeof put>>);
    await new FileStore().put(key, original);
    const [pathname, body, options] = vi.mocked(put).mock.calls[0];
    expect(pathname).toBe(key);
    expect(body).not.toEqual(original);
    expect(decrypt(body as Buffer)).toEqual(original);
    expect(options).toMatchObject({
      access: 'private',
      allowOverwrite: false,
      addRandomSuffix: false,
    });
  });
  it('recupera e decifra um anexo privado', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only');
    const original = Buffer.from('anexo fictício');
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Response(new Uint8Array(encrypt(original))).body,
    } as Awaited<ReturnType<typeof get>>);
    expect(await new FileStore().get(randomUUID())).toEqual(original);
    expect(get).toHaveBeenCalledWith(expect.any(String), { access: 'private' });
  });
  it('retorna erro para um anexo ausente', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only');
    vi.mocked(get).mockResolvedValue(null);
    await expect(new FileStore().get(randomUUID())).rejects.toThrow('Arquivo não encontrado');
  });
  it('não grava anexos no disco efêmero quando falta armazenamento', async () => {
    vi.stubEnv('VERCEL', '1');
    await expect(new FileStore().put(randomUUID(), Buffer.from('fictício'))).rejects.toThrow(
      'Armazenamento persistente',
    );
    await expect(new FileStore().get(randomUUID())).rejects.toThrow('Armazenamento persistente');
  });
  it('não cria um banco embarcado efêmero na Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    await expect(new Database().initialize()).rejects.toThrow('PostgreSQL persistente');
  });
});
