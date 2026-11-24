import 'reflect-metadata';
import './config';
import {
  Module,
  Catch,
  type ExceptionFilter,
  type ArgumentsHost,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { json } from 'express';
import { CoreModule, Database, DEMO } from './core';
import { AuthModule } from './auth';
import { RegistryRulesModule } from './registry-rules';
import { CasesModule } from './cases';
import { DocumentsModule } from './documents';
import { MonitoringModule } from './monitoring';
import { AdminModule } from './admin';
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500,
      message = 'Não foi possível concluir a operação';
    if (error instanceof ZodError) {
      status = 400;
      message = error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ');
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
    } else if (error?.code === '23505') {
      status = 409;
      message = 'Este registro já existe. Atualize a página antes de tentar novamente.';
    } else if (error?.code === '23503') {
      status = 400;
      message = 'O registro relacionado não foi encontrado neste município';
    } else if (error?.code === '42501') {
      status = 403;
      message = 'Operação bloqueada pela política de acesso';
    }
    if (status === 500) console.error('[SISLAM]', error?.code || error?.name || 'Error');
    res.status(status).set('Cache-Control', 'no-store').json({ error: message });
  }
}
@Module({
  imports: [
    CoreModule,
    AuthModule,
    RegistryRulesModule,
    CasesModule,
    DocumentsModule,
    MonitoringModule,
    AdminModule,
  ],
})
export class AppModule {}
export async function createApplication() {
  if (!DEMO())
    throw new Error(
      'Esta entrega é demonstrativa. A ativação operacional exige homologação normativa, assinatura, canais oficiais e revisão de segurança.',
    );
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    bodyParser: false,
    abortOnError: false,
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: '200kb' }));
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store');
    // The local Next.js proxy otherwise pools sockets that can close between
    // requests, producing intermittent ECONNRESET/500 during navigation.
    if (!process.env.VERCEL) res.setHeader('Connection', 'close');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const expected = process.env.WEB_ORIGIN || 'http://localhost:3400';
      if (req.get('Origin') !== expected)
        return res.status(403).json({ error: 'Origem da requisição não autorizada' });
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new Errors());
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SISLAM API')
      .setDescription('API local demonstrativa. Autenticação por cookie e isolamento municipal.')
      .setVersion('0.1.0')
      .addCookieAuth('sislam_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc);
  await app.get(Database).initialize();
  return app;
}
async function main() {
  if (!DEMO())
    throw new Error(
      'Esta primeira entrega é demonstrativa. A ativação operacional exige homologação normativa, assinatura, canais oficiais e revisão de segurança.',
    );
  const app = await createApplication();
  await app.listen(Number(process.env.PORT || 3401), '127.0.0.1');
  console.log('SISLAM API: http://localhost:' + (process.env.PORT || 3401) + '/api/docs');
  const close = async () => {
    await app.get(Database).close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
// Importing this module from Next's API adapter must not start a second local
// server or open the same database again. Only the explicit CLI entry boots it.
const entryFile = process.argv[1]?.replaceAll('\\', '/');
const directApiEntry = entryFile === 'api/main.ts' || entryFile?.endsWith('/api/main.ts');
if (directApiEntry && !process.env.SISLAM_TEST && !process.env.VERCEL)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
