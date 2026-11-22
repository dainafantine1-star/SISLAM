'use client';
import { Leaf, ShieldCheck } from 'lucide-react';
import { useApi, date } from '@/lib/api';
import { Loading, ErrorBox } from './ui';
export function VerifyLicense({ code }: { code: string }) {
  const data = useApi('public/license/' + code);
  return (
    <main className="public-page">
      <a className="brand" href="/login">
        <span className="brand-mark">
          <Leaf size={25} />
        </span>
        <span>
          SISLAM<small>GESTÃO AMBIENTAL</small>
        </span>
      </a>
      <section className="card padded">
        <ShieldCheck size={35} className="green" />
        <h1>Verificação de documento</h1>
        <ErrorBox error={data.error} />
        {!data.data && !data.error && <Loading />}
        {data.data && (
          <>
            <h2>{data.data.number}</h2>
            <dl className="detail-grid">
              <div>
                <dt>Município</dt>
                <dd>{data.data.municipality}</dd>
              </div>
              <div>
                <dt>Validade demonstrativa</dt>
                <dd>{date(data.data.valid_until)}</dd>
              </div>
              <div>
                <dt>Publicação demonstrativa</dt>
                <dd>{date(data.data.published_at)}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>Modelo de licença</dd>
              </div>
            </dl>
            <div className="callout warning">{data.data.message}</div>
          </>
        )}
      </section>
      <p className="muted small">
        Esta consulta não divulga documentos privados do processo ou dados do requerente.
      </p>
    </main>
  );
}
