'use client';
import Link from 'next/link';
import {
  FolderOpen,
  Files,
  FileBadge,
  CalendarClock,
  Plus,
  ClipboardList,
  Leaf,
  ShieldCheck,
  Clock3,
  Check,
  Building2,
} from 'lucide-react';
import { useApi, Entity, STATUS, ACTIONS, datetime, date, hasRole } from '@/lib/api';
import { PageHeading, Kpi, Loading, ErrorBox, Badge, Table, Empty } from './ui';
export function Dashboard({ user }: { user: Entity }) {
  const { data, error } = useApi('dashboard');
  if (!data)
    return (
      <>
        <ErrorBox error={error} />
        <Loading />
      </>
    );
  const counts = data.counts,
    stageMax = Math.max(...data.stages.map((s: Entity) => s.count), 1);
  return (
    <>
      <PageHeading
        eyebrow="SEU MUNICÍPIO, EM PERSPECTIVA"
        title={`Olá, ${user.name.split(' ')[0]}.`}
        description="Acompanhe os processos e o que precisa da sua atenção hoje."
        actions={
          hasRole(user, 'applicant', 'protocol') ? (
            <Link href="/processos?novo=1" className="button primary">
              <Plus size={18} />
              Novo requerimento
            </Link>
          ) : (
            <Link href="/processos" className="button secondary">
              <FolderOpen size={18} />
              Acompanhar processos
            </Link>
          )
        }
      />
      <section className="overview-banner">
        <div>
          <span className="banner-tag">
            <span />
            {String(data.municipality?.name || 'Município').toLocaleUpperCase('pt-BR')} ·{' '}
            {data.municipality?.state}
          </span>
          <h2>
            Uma visão clara.
            <br />
            Uma gestão mais sustentável.
          </h2>
          <p>
            Informação organizada para acompanhar cada etapa
            <br className="desktop-break" /> do licenciamento ambiental.
          </p>
          <div className="banner-meta">
            <ShieldCheck size={17} />
            <span>Histórico e versões preservados</span>
            <span className="banner-divider" />
            <Building2 size={17} />
            <span>{data.municipality?.name}</span>
          </div>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <span className="leaf-orbit">
            <Leaf size={72} strokeWidth={1.1} />
          </span>
          <span className="mini-orbit orbit-a">
            <Check size={22} />
          </span>
          <span className="mini-orbit orbit-b">
            <Files size={23} />
          </span>
          <span className="orbit-caption">CADA ETAPA IMPORTA</span>
        </div>
      </section>
      <div className="kpi-grid">
        <Kpi
          label="Processos em andamento"
          value={counts.active}
          detail={`${counts.processes} requerimentos cadastrados`}
          icon={<FolderOpen size={20} />}
        />
        <Kpi
          label="Aguardando recebimento"
          value={counts.awaiting_receipt}
          detail="Documentos enviados pelo requerente"
          icon={<Files size={20} />}
          color="blue"
        />
        <Kpi
          label="Licenças-modelo publicadas"
          value={counts.licenses}
          detail="Demonstração · sem validade jurídica"
          icon={<FileBadge size={20} />}
          color="purple"
        />
        <Kpi
          label="Condicionantes vencidas"
          value={counts.overdue_conditions}
          detail="Acompanhamento · não gera multa"
          icon={<CalendarClock size={20} />}
          color="amber"
        />
      </div>
      <div className="dashboard-columns">
        <section className="card processes-card">
          <div className="card-heading">
            <div>
              <h2>Processos recentes</h2>
              <p>Últimas movimentações do município</p>
            </div>
            <Link className="text-link" href="/processos">
              Ver todos
            </Link>
          </div>
          {data.recent.length ? (
            <Table headers={['Processo / empreendimento', 'Situação', 'Atualização', '']}>
              {data.recent.map((row: Entity) => (
                <tr key={row.id}>
                  <td>
                    <Link href={'/processos/' + row.id} className="process-title">
                      {row.protocol || 'Rascunho'}
                      <small>{row.establishment_name}</small>
                    </Link>
                  </td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td className="muted nowrap">{datetime(row.updated_at)}</td>
                  <td>
                    <Link className="table-link" href={'/processos/' + row.id}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty />
          )}
        </section>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Fluxo de processos</h2>
              <p>Distribuição por etapa</p>
            </div>
            <ClipboardList size={19} className="muted" />
          </div>
          <div className="stage-chart">
            {['filed', 'screening', 'requirements', 'analysis', 'decision', 'closed'].map(
              (status) => {
                const count = data.stages.find((s: Entity) => s.status === status)?.count || 0;
                return (
                  <div className="stage-row" key={status}>
                    <div>
                      <span>{STATUS[status]}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="bar-track">
                      <span
                        className={'bar ' + status}
                        style={{ width: `${(count / stageMax) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              },
            )}
          </div>
          <div className="chart-caption">
            <span className="tiny-dot" />
            Contagem atual · dados do município selecionado
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Agenda de condicionantes</h2>
              <p>Próximos prazos a acompanhar</p>
            </div>
            <Link className="text-link" href="/condicionantes">
              Ver agenda
            </Link>
          </div>
          {data.upcoming.length ? (
            <div className="agenda-list">
              {data.upcoming.map((c: Entity) => (
                <Link href={'/processos/' + c.case_id} key={c.id} className="agenda-item">
                  <span className="date-tile">
                    {date(c.due_date).slice(0, 2)}
                    <small>
                      {new Date(String(c.due_date).slice(0, 10) + 'T12:00:00Z')
                        .toLocaleString('pt-BR', { month: 'short' })
                        .replace('.', '')}
                    </small>
                  </span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>{c.protocol}</small>
                  </span>
                  <Badge status={c.status} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              <CalendarClock size={28} />
              <h3>Nenhuma condicionante na agenda</h3>
              <p>Os prazos aparecem aqui após o cadastro em uma licença-modelo.</p>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Atividade recente</h2>
              <p>Registro cronológico das operações</p>
            </div>
            <Clock3 size={18} className="muted" />
          </div>
          <div className="activity-list">
            {data.activity.map((a: Entity) => (
              <div className="activity-item" key={a.id}>
                <span className="activity-node">
                  <Check size={12} />
                </span>
                <div>
                  <strong>{ACTIONS[a.action] || a.action}</strong>
                  <small>{datetime(a.created_at)}</small>
                </div>
              </div>
            ))}
          </div>
          {hasRole(user, 'authority', 'municipal_admin') && (
            <Link href="/auditoria" className="activity-link">
              Consultar trilha de auditoria
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
