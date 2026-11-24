import type { NextApiRequest, NextApiResponse } from 'next';
import { createApplication } from '../../../api/main';

// Nest retains the same guards, RLS context and origin checks in both environments.
let application: Promise<Awaited<ReturnType<typeof createApplication>>> | undefined;
async function getApplication() {
  if (!application) {
    application = (async () => {
      if (
        !process.env.DATABASE_URL ||
        !process.env.WEB_ORIGIN ||
        (process.env.APP_ENCRYPTION_KEY?.length || 0) < 32
      )
        throw new Error('Configuração da demonstração online incompleta');
      const app = await createApplication();
      try {
        await app.init();
        return app;
      } catch (error) {
        await app.close();
        throw error;
      }
    })().catch((error) => {
      application = undefined;
      throw error;
    });
  }
  return application;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const app = await getApplication();
    await new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      app.getHttpAdapter().getInstance()(req, res);
    });
  } catch {
    console.error('[SISLAM] Falha na inicialização da API online');
    if (!res.headersSent)
      res.status(503).setHeader('Cache-Control', 'no-store').json({
        error: 'A API da demonstração está indisponível. Tente novamente em instantes.',
      });
  }
}

export const config = { api: { bodyParser: false, externalResolver: true }, maxDuration: 60 };
