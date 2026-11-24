'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MunicipalWorkflow } from './MunicipalWorkflow';
import { ClassificationForm } from './ManualForms';
import {
  Plus,
  FolderOpen,
  Filter,
  FileText,
  Upload,
  Download,
  CheckCircle2,
  Clock,
  ShieldCheck,
  History,
  Building2,
  MapPin,
  Leaf,
  AlertCircle,
  ClipboardCheck,
  FileBadge,
  UserRound,
  RefreshCw,
} from 'lucide-react';
import {
  api,
  useApi,
  changed,
  Entity,
  field,
  date,
  datetime,
  STATUS,
  ACTIONS,
  hasRole,
} from '@/lib/api';
import {
  PageHeading,
  Button,
  Field,
  Select,
  Area,
  Check,
  ActionForm,
  Badge,
  Table,
  Modal,
  SearchBox,
  ErrorBox,
  Empty,
  Loading,
} from './ui';
export function ProcessList({ user, mode }: { user: Entity; mode: string }) {
  const data = useApi<Entity[]>('cases'),
    registry = useApi('registry'),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [client, setClient] = useState(''),
    [creating, setCreating] = useState(false),
    params = useSearchParams();
  useEffect(() => {
    setSearch(params?.get('q') || '');
    if (params?.get('novo') === '1') setCreating(true);
  }, [params]);
  const list = (data.data || [])
    .filter(
      (c) =>
        (mode !== 'analise' || ['analysis', 'requirements', 'decision'].includes(c.status)) &&
        (mode !== 'arquivo' || c.status === 'closed'),
    )
    .filter(
      (c) =>
        (!status || c.status === status) &&
        (!client || c.organization_name === client) &&
        `${c.protocol || ''} ${c.title} ${c.establishment_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const title =
    mode === 'analise'
      ? 'Fila de análise técnica'
      : mode === 'arquivo'
        ? 'Arquivo digital'
        : 'Processos ambientais';
  return (
    <>
      <PageHeading
        eyebrow="LICENCIAMENTO AMBIENTAL"
        title={title}
        description={
          mode === 'arquivo'
            ? 'Consulte os dossiês encerrados, seus documentos e histórico.'
            : 'Do requerimento à decisão, acompanhe cada etapa do processo.'
        }
        actions={
          hasRole(user, 'applicant', 'protocol') && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={18} />
              Novo requerimento
            </Button>
          )
        }
      />
      <div className="section-summary">
        <span>
          <strong>{list.length}</strong>{' '}
          {mode === 'arquivo' ? 'dossiês encerrados' : 'processos nesta visualização'}
        </span>
        <span>
          <ShieldCheck size={16} />
          Histórico de movimentações preservado
        </span>
      </div>
      <section className="card">
        <div className="list-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Pesquisar protocolo, título ou empreendimento"
          />
          <label className="inline-filter">
            <Filter size={16} />
            <span className="sr-only">Filtrar situação</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas as situações</option>
              {[
                'draft',
                'filed',
                'screening',
                'requirements',
                'analysis',
                'decision',
                'closed',
              ].map((s) => (
                <option key={s} value={s}>
                  {STATUS[s]}
                </option>
              ))}
            </select>
          </label>
          {hasRole(user, 'applicant') && (
            <label className="inline-filter">
              <span className="sr-only">Filtrar cliente</span>
              <select
                aria-label="Filtrar cliente"
                value={client}
                onChange={(event) => setClient(event.target.value)}
              >
                <option value="">Todos os clientes</option>
                {registry.data?.organizations.map((organization: Entity) => (
                  <option key={organization.id} value={organization.name}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <ErrorBox error={data.error} />
        {!data.data && !data.error ? (
          <Loading />
        ) : list.length ? (
          <>
            <Table
              headers={[
                'Protocolo / requerimento',
                'Empreendimento',
                'Situação',
                'Última atualização',
                '',
              ]}
            >
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={'/processos/' + c.id} className="process-title">
                      {c.protocol || 'Rascunho'}
                      <small>
                        {c.request_type === 'renewal' ? 'Renovação' : 'Requerimento inicial'}
                      </small>
                    </Link>
                  </td>
                  <td>
                    <strong className="cell-name">{c.establishment_name}</strong>
                    <small className="cell-sub">{c.organization_name}</small>
                  </td>
                  <td>
                    <Badge status={c.status} />
                  </td>
                  <td className="muted nowrap">{datetime(c.updated_at)}</td>
                  <td>
                    <Link className="table-link" href={'/processos/' + c.id}>
                      Ver processo
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="table-footer">
              {list.length} registros · dados do município e do seu perfil
            </div>
          </>
        ) : (
          <Empty
            title="Nenhum processo nesta visualização"
            detail="Altere os filtros ou cadastre um requerimento."
          />
        )}
      </section>
      {creating && (
        <Modal title="Novo requerimento ambiental" onClose={() => setCreating(false)}>
          <p className="modal-intro">
            Escolha um empreendimento cadastrado. A regra demonstrativa será consultada e congelada
            quando você protocolar.
          </p>
          <ActionForm
            label="Criar requerimento"
            submit={async (f) => {
              const result = await api('cases', {
                establishmentId: field(f, 'establishmentId'),
                title: field(f, 'title'),
              });
              window.location.assign('/processos/' + result.id);
            }}
          >
            <Select name="establishmentId" label="Empreendimento" required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {registry.data?.establishments.map((e: Entity) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Field
              name="title"
              label="Objeto do requerimento"
              required
              minLength={5}
              maxLength={200}
            />
            {registry.data?.establishments.length === 0 && (
              <p className="wide">
                Cadastre primeiro uma organização e um empreendimento em{' '}
                <Link className="text-link" href="/empreendimentos">
                  Empreendimentos
                </Link>
                .
              </p>
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function CaseDetail({ user, caseId }: { user: Entity; caseId: string }) {
  const data = useApi('cases/' + caseId),
    team = useApi<Entity[]>(
      hasRole(user, 'municipal_admin', 'protocol', 'analyst', 'authority', 'inspector')
        ? 'admin/team'
        : null,
    ),
    [tab, setTab] = useState('overview'),
    [modal, setModal] = useState(''),
    [to, setTo] = useState(''),
    [draft, setDraft] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (!data.data)
    return (
      <>
        <ErrorBox error={data.error} />
        {!data.error && <Loading />}
      </>
    );
  const c = data.data,
    missing = c.checklist.filter(
      (d: Entity) =>
        d.kind === 'required' &&
        (!d.document || !['accepted', 'reservation'].includes(d.document.status)),
    ),
    e = c.establishment,
    stages = ['draft', 'filed', 'screening', 'requirements', 'analysis', 'decision', 'closed'];
  async function run(task: () => Promise<unknown>, text = 'Operação registrada.') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(text);
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na operação');
    } finally {
      setBusy(false);
    }
  }
  async function upload(requirementKey: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    form.set('requirementKey', requirementKey);
    await run(
      () => api('documents/cases/' + c.id, form),
      'Documento anexado com nova versão e recibo.',
    );
  }
  const transitions = c.workflow_step
    ? []
    : c.status === 'filed' && hasRole(user, 'protocol')
      ? ['screening']
      : c.status === 'screening' && hasRole(user, 'protocol', 'analyst')
        ? ['requirements', 'analysis']
        : c.status === 'requirements' && hasRole(user, 'protocol', 'analyst')
          ? ['analysis']
          : c.status === 'analysis' && hasRole(user, 'analyst')
            ? ['requirements', 'decision']
            : c.status === 'decision' && hasRole(user, 'authority')
              ? ['closed']
              : [];
  return (
    <>
      <Link href="/processos" className="back-link">
        Todos os processos
      </Link>
      <PageHeading
        eyebrow={c.protocol || 'REQUERIMENTO EM RASCUNHO'}
        title={e.name}
        description={c.title}
        actions={<Badge status={c.status} />}
      />
      <ErrorBox error={error} />
      {message && (
        <div className="feedback success" role="status">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}
      <MunicipalWorkflow process={c} user={user} selectTab={setTab} />
      {!c.workflow_step && (
        <div className="workflow-strip">
          {stages.map((s, i) => (
            <div
              key={s}
              className={c.status === s ? 'current' : i < stages.indexOf(c.status) ? 'done' : ''}
            >
              <span>{i < stages.indexOf(c.status) ? <CheckCircle2 size={15} /> : i + 1}</span>
              <small>{STATUS[s]}</small>
            </div>
          ))}
        </div>
      )}
      <div className="case-tabs" role="tablist" aria-label="Seções do processo">
        {[
          ['overview', 'Visão geral'],
          ['documents', `Documentos (${c.documents.length})`],
          ['analysis', 'Análise técnica'],
          ['license', 'Licença e condicionantes'],
          ['timeline', 'Histórico'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={'tab-' + id}
            id={'tab-button-' + id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={'tab-' + tab} aria-labelledby={'tab-button-' + tab}>
        {tab === 'overview' && (
          <div className="case-columns">
            <div className="stack">
              <section className="card padded">
                <div className="card-heading plain">
                  <h2>
                    <Building2 size={19} />
                    Dados do empreendimento
                  </h2>
                </div>
                <dl className="detail-grid">
                  <div>
                    <dt>Organização</dt>
                    <dd>{e.organization_name}</dd>
                  </div>
                  <div>
                    <dt>Identificador de cadastro</dt>
                    <dd>{e.registration}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{e.representative}</dd>
                  </div>
                  <div>
                    <dt>Atividade</dt>
                    <dd>{e.activity}</dd>
                  </div>
                  <div className="wide">
                    <dt>Localização</dt>
                    <dd>{e.address}</dd>
                  </div>
                  <div>
                    <dt>Capacidade informada</dt>
                    <dd>{e.capacity}</dd>
                  </div>
                  <div>
                    <dt>Área informada</dt>
                    <dd>{e.area} m²</dd>
                  </div>
                </dl>
              </section>
              <section className="card padded">
                <div className="card-heading plain">
                  <h2>
                    <Leaf size={19} />
                    Enquadramento preliminar
                  </h2>
                  <Badge>
                    {c.classification?.manual ? 'Análise manual necessária' : 'Demonstrativo'}
                  </Badge>
                </div>
                {c.classification ? (
                  <>
                    <dl className="detail-grid">
                      <div>
                        <dt>Porte ambiental</dt>
                        <dd>{c.classification.label || 'A definir por análise manual'}</dd>
                      </div>
                      <div>
                        <dt>Potencial poluidor</dt>
                        <dd>{c.classification.potential || 'Não definido'}</dd>
                      </div>
                      <div>
                        <dt>Modalidade possível</dt>
                        <dd>{c.classification.modality || 'Não definida'}</dd>
                      </div>
                      <div>
                        <dt>Versão da regra</dt>
                        <dd>
                          {c.rule_snapshot?.version
                            ? `Versão ${c.rule_snapshot.version}`
                            : 'Não localizada'}
                        </dd>
                      </div>
                      <div className="wide">
                        <dt>Referência</dt>
                        <dd>
                          {c.classification.source ||
                            c.rule_snapshot?.source_reference ||
                            c.classification.reason}
                        </dd>
                      </div>
                    </dl>
                    <div className="callout warning">
                      {c.classification.competence || c.classification.reason} Enquadramento sujeito
                      à validação normativa.
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    O enquadramento será consultado ao protocolar este requerimento.
                  </p>
                )}
              </section>
            </div>
            <aside className="stack">
              <section className="card padded">
                <h2>Próximas ações</h2>
                {!c.workflow_step &&
                  c.status === 'draft' &&
                  hasRole(user, 'applicant', 'protocol') && (
                    <Button className="full" onClick={() => setModal('file')}>
                      <FolderOpen size={17} />
                      Protocolar requerimento
                    </Button>
                  )}
                {transitions.map((s) => (
                  <Button
                    variant="secondary"
                    className="full"
                    key={s}
                    onClick={() => {
                      setTo(s);
                      setModal('transition');
                    }}
                  >
                    {s === 'decision'
                      ? 'Encaminhar à autoridade'
                      : s === 'closed'
                        ? 'Encerrar processo'
                        : `Mover para ${STATUS[s].toLowerCase()}`}
                  </Button>
                ))}
                <Button variant="secondary" className="full" onClick={() => setTab('documents')}>
                  <FilesIcon />
                  Conferir documentação
                </Button>
                {hasRole(user, 'analyst', 'protocol') && (
                  <Button
                    variant="secondary"
                    className="full"
                    onClick={() => {
                      setModal('notice');
                    }}
                  >
                    <FileText size={17} />
                    Minuta de exigência
                  </Button>
                )}
                {hasRole(user, 'analyst') &&
                  (!c.workflow_step || ['4', '5', '6'].includes(c.workflow_step)) && (
                    <Button
                      variant="secondary"
                      className="full"
                      onClick={() => setModal('classification')}
                    >
                      Revisar enquadramento
                    </Button>
                  )}
                {hasRole(user, 'protocol', 'authority') && (
                  <Button variant="ghost" className="full" onClick={() => setModal('assign')}>
                    <UserRound size={17} />
                    Atribuir técnico
                  </Button>
                )}
                {c.licenses.length > 0 &&
                  (!c.workflow_step || c.workflow_step === 'renewal_ready') &&
                  hasRole(user, 'applicant', 'protocol') && (
                    <Button
                      variant="ghost"
                      className="full"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await api('cases', {
                            establishmentId: e.id,
                            title: 'Renovação — ' + c.title,
                            parentId: c.id,
                          });
                          window.location.assign('/processos/' + result.id);
                        })
                      }
                    >
                      <RefreshCw size={17} />
                      Iniciar renovação
                    </Button>
                  )}
              </section>
              <section className="card padded">
                <h2>Completude documental</h2>
                <strong className="completion-value">
                  {c.checklist.filter((d: Entity) => d.document).length}
                  <small> / {c.checklist.length} itens enviados</small>
                </strong>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${c.checklist.length ? (c.checklist.filter((d: Entity) => d.document).length / c.checklist.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="muted small">
                  {missing.length} itens ainda exigem envio ou aprovação técnica.
                </p>
              </section>
              <div className="case-meta">
                <ShieldCheck size={18} />
                <p>
                  Recebimento, análise e decisão têm responsáveis distintos. A trilha fica
                  preservada.
                </p>
              </div>
            </aside>
          </div>
        )}
        {tab === 'documents' && (
          <div className="stack">
            <div className="callout">
              O envio gera uma nova versão. Recebimento administrativo e aprovação técnica são
              etapas separadas. Na demonstração, o antivírus não está integrado.
            </div>
            {c.checklist.map((item: Entity) => (
              <section className="card document-item" key={item.key}>
                <div className="document-icon">
                  <FileText size={23} />
                </div>
                <div className="document-info">
                  <h3>{item.name}</h3>
                  <p>
                    {item.kind === 'required'
                      ? 'Obrigatório no cenário demonstrativo'
                      : item.kind === 'conditional'
                        ? 'Condicional: ' + item.condition
                        : 'Dispensado no cenário'}
                  </p>
                  {item.document ? (
                    <>
                      <Badge status={item.document.status} />
                      <span className="document-version">
                        Versão {item.document.version} · {item.document.filename}
                      </span>
                      {item.document.review_note && <p>Observação: {item.document.review_note}</p>}
                    </>
                  ) : (
                    <Badge status="requirements">Não enviado</Badge>
                  )}
                </div>
                <div className="document-actions">
                  {item.document && (
                    <>
                      <a
                        className="button secondary compact"
                        href={'/api/documents/' + item.document.id + '/download'}
                      >
                        <Download size={15} />
                        Baixar
                      </a>
                      {hasRole(user, 'protocol') &&
                        (!c.workflow_step ||
                          [
                            '9',
                            '14',
                            '15_receipt',
                            '23_receipt',
                            '22',
                            '24',
                            '25',
                            'renewal_ready',
                          ].includes(c.workflow_step)) &&
                        item.document.status === 'sent' && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(() => api('documents/' + item.document.id + '/receive', {}))
                            }
                          >
                            Registrar recebimento
                          </Button>
                        )}
                      {hasRole(user, 'analyst') &&
                        (!c.workflow_step ||
                          ['10', '15a', '22', '24', '25', 'renewal_ready'].includes(
                            c.workflow_step,
                          )) &&
                        item.document.status === 'received' && (
                          <Button
                            onClick={() => {
                              setTo(item.document.id);
                              setModal('review');
                            }}
                          >
                            Analisar documento
                          </Button>
                        )}
                    </>
                  )}
                  {hasRole(user, 'applicant', 'protocol') &&
                    (!c.workflow_step || ['8', '10c', '15b'].includes(c.workflow_step)) &&
                    c.status !== 'closed' && (
                      <label
                        className={`button ${item.document ? 'secondary' : 'primary'} file-button`}
                      >
                        <Upload size={16} />
                        {item.document ? 'Enviar nova versão' : 'Anexar documento'}
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          disabled={busy}
                          onChange={async (ev) => {
                            const input = ev.currentTarget,
                              file = input.files?.[0];
                            if (file) await upload(item.key, file);
                            input.value = '';
                          }}
                        />
                      </label>
                    )}
                </div>
              </section>
            ))}
            {c.documents.length > 0 && (
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Todas as versões recebidas</h2>
                    <p>Os originais permanecem disponíveis</p>
                  </div>
                </div>
                <Table headers={['Arquivo', 'Versão', 'Integridade SHA-256', 'Data', '']}>
                  {c.documents.map((d: Entity) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.filename}</strong>
                        <small className="cell-sub">
                          {d.scan_status === 'demo_unscanned'
                            ? 'Antivírus não executado · demonstração'
                            : d.scan_status}
                        </small>
                      </td>
                      <td>{d.version}</td>
                      <td>
                        <code className="hash" title={d.sha256}>
                          {d.sha256.slice(0, 16)}…
                        </code>
                      </td>
                      <td className="nowrap">{datetime(d.created_at)}</td>
                      <td>
                        <a className="table-link" href={'/api/documents/' + d.id + '/download'}>
                          Baixar
                        </a>
                        {d.requirement_key.startsWith('extra_') && <Badge status={d.status} />}
                        {d.requirement_key.startsWith('extra_') &&
                          d.status === 'sent' &&
                          hasRole(user, 'protocol') &&
                          (!c.workflow_step ||
                            ['9', '14', '15_receipt', '23_receipt'].includes(c.workflow_step)) && (
                            <Button
                              variant="secondary"
                              onClick={() => run(() => api(`documents/${d.id}/receive`, {}))}
                            >
                              Registrar recebimento
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </section>
            )}
          </div>
        )}
        {tab === 'analysis' && (
          <div className="stack">
            {hasRole(user, 'analyst') && (!c.workflow_step || c.workflow_step === '18') && (
              <section className="card padded">
                <div className="card-heading plain">
                  <div>
                    <h2>Parecer técnico</h2>
                    <p>A minuta usa os dados do processo. A análise e revisão são do técnico.</p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await api('cases/' + c.id + '/draft');
                        setDraft(result.text);
                      }, 'Minuta preparada a partir do checklist. IA não utilizada.')
                    }
                  >
                    Preparar minuta
                  </Button>
                </div>
                <ActionForm
                  label="Registrar versão do parecer"
                  submit={async (f) => {
                    await api('cases/' + c.id + '/opinion', {
                      conclusion: field(f, 'conclusion'),
                      text: field(f, 'text'),
                      reviewed: f.has('reviewed'),
                      ...(c.opinions.length ? { reason: field(f, 'reason') } : {}),
                    });
                    changed();
                  }}
                >
                  <Select name="conclusion" label="Conclusão">
                    <option value="complement">Solicitar complementação</option>
                    <option value="favorable">Favorável</option>
                    <option value="favorable_reservations">
                      Favorável com ressalvas e condicionantes
                    </option>
                    <option value="unfavorable">Desfavorável</option>
                  </Select>
                  <Area
                    key={draft}
                    name="text"
                    label="Fundamentação e análise"
                    required
                    minLength={30}
                    maxLength={30000}
                    defaultValue={draft}
                    rows={12}
                  />
                  {c.opinions.length > 0 && (
                    <Area
                      name="reason"
                      label="Justificativa da revisão do parecer"
                      required
                      minLength={20}
                      maxLength={2000}
                    />
                  )}
                  <Check
                    name="reviewed"
                    label="Revisei o conteúdo e assumo a responsabilidade técnica desta versão"
                  />
                </ActionForm>
              </section>
            )}
            {c.opinions.length ? (
              c.opinions.map((o: Entity) => (
                <section key={o.id} className="card padded">
                  <div className="card-heading plain">
                    <h2>Parecer · versão {o.version}</h2>
                    <Badge status={o.status} />
                  </div>
                  <p className="meta-line">
                    {STATUS[o.conclusion]} · {datetime(o.created_at)}
                  </p>
                  <div className="prose-text">{o.text}</div>
                </section>
              ))
            ) : (
              <Empty
                title="Nenhum parecer registrado"
                detail="A análise técnica será registrada por um usuário com o perfil adequado."
              />
            )}
          </div>
        )}
        {tab === 'license' && (
          <div className="stack">
            {(hasRole(user, 'authority') ||
              (hasRole(user, 'protocol') && c.workflow_step === '21')) &&
              c.licenses.length === 0 && (
                <section className="card padded">
                  <h2>
                    {c.workflow_step
                      ? 'Ato autorizativo · modelo demonstrativo'
                      : 'Decisão da autoridade · demonstração'}
                  </h2>
                  <p className="muted">
                    A emissão exige parecer favorável revisado e documentação sem pendências
                    impeditivas.
                  </p>
                  {!c.workflow_step && (
                    <Button variant="secondary" onClick={() => setModal('refuse')}>
                      Registrar indeferimento demonstrativo
                    </Button>
                  )}
                  <ActionForm
                    label="Aprovar licença-modelo"
                    submit={async (f) => {
                      await api('cases/' + c.id + '/license', {
                        validUntil: field(f, 'validUntil'),
                        text: field(f, 'text'),
                        confirmed: f.has('confirmed'),
                      });
                      changed();
                    }}
                  >
                    <Field name="validUntil" label="Validade demonstrativa" type="date" required />
                    <Area
                      name="text"
                      label="Texto da licença-modelo"
                      required
                      minLength={30}
                      maxLength={30000}
                      rows={7}
                    />
                    <Check
                      name="confirmed"
                      label="Confirmo a decisão demonstrativa. Este modelo não é um ato oficial."
                      required
                    />
                  </ActionForm>
                </section>
              )}
            {c.licenses.map((l: Entity) => (
              <section key={l.id} className="card padded">
                <div className="card-heading plain">
                  <div>
                    <h2>{l.number}</h2>
                    <p>Validade demonstrativa: {date(l.valid_until)}</p>
                  </div>
                  <Badge status={l.status} />
                </div>
                <div className="prose-text">{l.text}</div>
                <div className="row-actions">
                  <a className="button secondary" href={'/api/licenses/' + l.id + '/pdf'}>
                    <Download size={17} />
                    Baixar PDF-modelo
                  </a>
                  {l.status === 'published_demo' ? (
                    <Link className="button secondary" href={'/verificar/' + l.verification_code}>
                      Verificar código
                    </Link>
                  ) : (
                    hasRole(user, 'authority') && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api('licenses/' + l.id + '/publish', {}),
                            'Modelo publicado na consulta demonstrativa.',
                          )
                        }
                      >
                        Publicar modelo
                      </Button>
                    )
                  )}
                  {(hasRole(user, 'authority') ||
                    (hasRole(user, 'analyst') && ['21', '22'].includes(c.workflow_step))) && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setTo(l.id);
                        setModal('condition');
                      }}
                    >
                      Adicionar condicionante
                    </Button>
                  )}
                </div>
              </section>
            ))}
            {!c.licenses.length && !hasRole(user, 'authority') && (
              <Empty
                title="Nenhuma licença-modelo emitida"
                detail="A decisão é feita pela autoridade após a análise técnica."
              />
            )}
            {c.conditions.length > 0 && (
              <section className="card">
                <div className="card-heading">
                  <h2>Condicionantes vinculadas</h2>
                  <Link className="text-link" href="/condicionantes">
                    Acompanhar agenda
                  </Link>
                </div>
                <Table headers={['Condicionante', 'Prazo', 'Situação']}>
                  {c.conditions.map((d: Entity) => (
                    <tr key={d.id}>
                      <td>{d.title}</td>
                      <td>{date(d.due_date)}</td>
                      <td>
                        <Badge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </Table>
              </section>
            )}
          </div>
        )}
        {tab === 'timeline' && (
          <section className="card padded">
            <h2>Histórico do processo</h2>
            <div className="case-timeline">
              {c.timeline.map((a: Entity) => (
                <article key={a.id}>
                  <span className="timeline-node">
                    <History size={15} />
                  </span>
                  <div>
                    <h3>{ACTIONS[a.action] || a.action}</h3>
                    <p>{datetime(a.created_at)}</p>
                    <details>
                      <summary>Detalhes da operação</summary>
                      <pre>{JSON.stringify(a.payload, null, 2)}</pre>
                      <small>Integridade: {a.event_hash}</small>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
      {modal && (
        <Modal
          title={
            modal === 'classification'
              ? 'Revisar enquadramento demonstrativo'
              : modal === 'refuse'
                ? 'Indeferimento demonstrativo'
                : modal === 'file'
                  ? 'Protocolar requerimento'
                  : modal === 'transition'
                    ? 'Movimentar processo'
                    : modal === 'review'
                      ? 'Analisar documento'
                      : modal === 'assign'
                        ? 'Atribuir técnico'
                        : modal === 'condition'
                          ? 'Cadastrar condicionante'
                          : 'Minuta de notificação'
          }
          onClose={() => setModal('')}
          wide={modal === 'notice'}
        >
          {modal === 'file' && (
            <ActionForm
              label="Confirmar protocolo"
              submit={async (f) => {
                await api('cases/' + c.id + '/file', {
                  revision: c.revision,
                  confirmed: f.has('confirmed'),
                });
                changed();
                setModal('');
              }}
            >
              <p className="wide">
                O protocolo registrará a data, o enquadramento preliminar e a versão da regra
                disponível. A competência e as exigências continuam sujeitas à validação humana.
              </p>
              <Check
                name="confirmed"
                label="Conferi os dados e desejo protocolar este requerimento demonstrativo"
                required
              />
            </ActionForm>
          )}
          {modal === 'transition' && (
            <ActionForm
              label="Registrar movimentação"
              submit={async (f) => {
                await api('cases/' + c.id + '/transition', {
                  to,
                  reason: field(f, 'reason'),
                  revision: c.revision,
                });
                changed();
                setModal('');
              }}
            >
              <p className="wide">
                De <strong>{STATUS[c.status]}</strong> para <strong>{STATUS[to]}</strong>.
              </p>
              <Area
                name="reason"
                label="Motivo da movimentação"
                required
                minLength={8}
                maxLength={2000}
              />
            </ActionForm>
          )}
          {modal === 'review' && (
            <ActionForm
              label="Registrar análise técnica"
              submit={async (f) => {
                await api('documents/' + to + '/review', {
                  status: field(f, 'status'),
                  note: field(f, 'note'),
                });
                changed();
                setModal('');
              }}
            >
              <Select name="status" label="Resultado">
                <option value="accepted">Aceito</option>
                <option value="reservation">Aceito com ressalvas</option>
                <option value="rejected">Rejeitado</option>
              </Select>
              <Area
                name="note"
                label="Justificativa técnica"
                required
                minLength={8}
                maxLength={3000}
              />
            </ActionForm>
          )}
          {modal === 'assign' && (
            <ActionForm
              label="Atribuir técnico"
              submit={async (f) => {
                await api('cases/' + c.id + '/assign', {
                  userId: field(f, 'userId'),
                  reason: field(f, 'reason'),
                });
                changed();
                setModal('');
              }}
            >
              <Select name="userId" label="Técnico responsável" required>
                <option value="">Selecione…</option>
                {team.data
                  ?.filter((p) => p.role === 'analyst' && p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
              <Area
                name="reason"
                label="Motivo da distribuição"
                required
                minLength={8}
                maxLength={500}
              />
            </ActionForm>
          )}
          {modal === 'condition' && (
            <ActionForm
              label="Cadastrar condicionante"
              submit={async (f) => {
                await api('licenses/' + to + '/conditions', {
                  title: field(f, 'title'),
                  responsible: field(f, 'responsible'),
                  dueDate: field(f, 'dueDate'),
                });
                changed();
                setModal('');
              }}
            >
              <Area
                name="title"
                label="Obrigação demonstrativa"
                required
                minLength={8}
                maxLength={1000}
              />
              <Field
                name="responsible"
                label="Responsável pelo cumprimento"
                required
                minLength={3}
                maxLength={160}
              />
              <Field name="dueDate" label="Data de cumprimento" type="date" required />
            </ActionForm>
          )}
          {modal === 'refuse' && (
            <ActionForm
              label="Registrar indeferimento"
              submit={async (f) => {
                await api('cases/' + c.id + '/refuse', {
                  reason: field(f, 'reason'),
                  confirmed: f.has('confirmed'),
                });
                changed();
                setModal('');
              }}
            >
              <Area
                name="reason"
                label="Fundamentação da decisão demonstrativa"
                required
                minLength={30}
                maxLength={5000}
              />
              <Check
                name="confirmed"
                label="Confirmo a decisão demonstrativa, sem validade jurídica"
                required
              />
            </ActionForm>
          )}
          {modal === 'classification' && (
            <ClassificationForm process={c} onDone={() => setModal('')} />
          )}
          {modal === 'notice' && (
            <ActionForm
              label="Salvar minuta de notificação"
              submit={async (f) => {
                await api('cases/' + c.id + '/notices', {
                  title: field(f, 'title'),
                  text: field(f, 'text'),
                  days: Number(field(f, 'days')),
                  counting: field(f, 'counting'),
                  deadlineBasis: field(f, 'basis'),
                });
                changed();
                setModal('');
              }}
            >
              <Field
                name="title"
                label="Assunto"
                required
                minLength={5}
              />
              <Area
                name="text"
                label="Texto da minuta"
                rows={7}
                required
                minLength={20}
              />
              <Field
                name="days"
                label="Prazo demonstrativo (dias)"
                type="number"
                min={1}
                max={3650}
                required
              />
              <Select name="counting" label="Forma de contagem">
                <option value="calendar">Dias corridos</option>
                <option value="business">Dias úteis e calendário cadastrado</option>
              </Select>
              <Area
                name="basis"
                label="Fundamento do prazo / parâmetro demonstrativo"
                required
                minLength={12}
                maxLength={2000}
              />
              <p className="wide small muted">
                O prazo só começa após o registro de ciência demonstrativa, com evidência e data.
                Nenhum e-mail será enviado.
              </p>
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
function FilesIcon() {
  return <FileText size={17} />;
}
