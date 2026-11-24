import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());

describe('cliente HTTP do SISLAM', () => {
  it.each([
    [404, 'The page could not be found\n\nDNS_HOSTNAME_RESOLVED_PRIVATE'],
    [502, '<html><body>Bad Gateway</body></html>'],
    [200, '{invalid'],
  ])('trata uma resposta inválida (%s) sem expor o erro de JSON', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
    await expect(api('auth/me')).rejects.toThrow('Não foi possível conectar à API do SISLAM');
  });

  it('preserva o erro de negócio devolvido pela API', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: 'E-mail ou senha inválidos' }, { status: 401 })),
    );
    await expect(api('auth/login', { password: 'invalid' })).rejects.toThrow(
      'E-mail ou senha inválidos',
    );
  });

  it('redireciona uma sessão expirada mesmo quando a resposta não contém JSON', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    );
    await expect(api('auth/me')).rejects.toThrow('Não foi possível conectar à API do SISLAM');
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('traduz falhas de rede para uma mensagem de conexão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('auth/me')).rejects.toThrow('Não foi possível conectar à API do SISLAM');
  });

  it('continua retornando os dados e enviando o corpo JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(api('auth/login', { email: 'admin@demo.sislam.test' })).resolves.toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.sislam.test' }),
    });
  });
});
