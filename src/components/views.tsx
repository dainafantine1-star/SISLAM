'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  FileText,
  Upload,
  Download,
  ShieldCheck,
  CheckCircle2,
  ScanSearch,
  Megaphone,
  BookOpen,
  LockKeyhole,
  Users,
  CalendarDays,
  Settings2,
  Search,
  Leaf,
  Mail,
  ExternalLink,
  KeyRound,
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
  ROLE_LABELS,
  hasRole,
} from '@/lib/api';
import {
  Button,
  PageHeading,
  Field,
  Select,
  Area,
  Check,
  ActionForm,
  Badge,
  Table,
  Modal,
  Empty,
  Loading,
  ErrorBox,
  SearchBox,
} from './ui';
function Loaded({
  data,
  error,
  children,
}: {
  data: unknown;
  error: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ErrorBox error={error} />
      {data ? children : !error && <Loading />}
    </>
  );
}
export function RegistryView({ user }: { user: Entity }) {
  const team = useApi<Entity[]>(hasRole(user, 'protocol', 'municipal_admin') ? 'admin/team' : null);
  const registry = useApi('registry'),
    rules = useApi<Entity[]>('rules'),
    [modal, setModal] = useState(''),
    [search, setSearch] = useState('');
  const sites = (registry.data?.establishments || []).filter((e: Entity) =>
    `${e.name} ${e.organization_name}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="CADASTRO AMBIENTAL"
        title="Empreendimentos"
        description="Organizações, responsáveis e unidades de atividade do município."
        actions={
          hasRole(user, 'applicant', 'protocol', 'municipal_admin') && (
            <>
              <Button variant="secondary" onClick={() => setModal('organization')}>
                <Plus size={17} />
                Nova organização
              </Button>
              <Button onClick={() => setModal('site')}>
                <Plus size={17} />
                Novo empreendimento
              </Button>
            </>
          )
        }
      />
      <div className="section-summary">
        <span>
          <strong>{registry.data?.organizations.length || 0}</strong> organizações
        </span>
        <span>
          <strong>{registry.data?.establishments.length || 0}</strong> empreendimentos
        </span>
      </div>
      <section className="card">
        <div className="list-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Pesquisar empreendimento ou organização"
          />
        </div>
        <Loaded data={registry.data} error={registry.error}>
          {sites.length ? (
            <Table
              headers={[
                'Empreendimento / organização',
                'Atividade',
                'Localização',
                'Capacidade',
                'Área',
              ]}
            >
              {sites.map((e: Entity) => (
                <tr key={e.id}>
                  <td>
                    <strong className="cell-name">{e.name}</strong>
                    <small className="cell-sub">{e.organization_name}</small>
                  </td>
                  <td>
                    <span className="code-pill">{e.activity}</span>
                  </td>
                  <td className="muted">{e.address}</td>
                  <td>{e.capacity}</td>
                  <td>{e.area} m²</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Nenhum empreendimento encontrado"
              detail="Cadastre uma organização e depois a unidade de atividade."
            />
          )}
        </Loaded>
      </section>
      {modal && (
        <Modal
          title={modal === 'site' ? 'Cadastrar empreendimento' : 'Cadastrar organização'}
          onClose={() => setModal('')}
          wide
        >
          <ActionForm
            label="Salvar cadastro"
            submit={async (f) => {
              if (modal === 'organization')
                await api('registry/organizations', {
                  name: field(f, 'name'),
                  registration: field(f, 'registration'),
                  representative: field(f, 'representative'),
                  email: field(f, 'email'),
                  phone: field(f, 'phone'),
                  ...(user.role !== 'applicant' ? { ownerId: field(f, 'ownerId') } : {}),
                });
              else
                await api('registry/establishments', {
                  organizationId: field(f, 'organizationId'),
                  name: field(f, 'name'),
                  activity: field(f, 'activity'),
                  address: field(f, 'address'),
                  latitude: field(f, 'latitude') ? Number(field(f, 'latitude')) : null,
                  longitude: field(f, 'longitude') ? Number(field(f, 'longitude')) : null,
                  capacity: Number(field(f, 'capacity')),
                  area: Number(field(f, 'area')),
                });
              changed();
              setModal('');
            }}
          >
            {modal === 'site' ? (
              <>
                <Select name="organizationId" label="Organização" required defaultValue="">
                  <option value="">Selecione…</option>
                  {registry.data?.organizations.map((o: Entity) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
                <Field
                  name="name"
                  label="Nome do empreendimento"
                  minLength={3}
                  maxLength={200}
                  required
                />
                <Select name="activity" label="Atividade demonstrativa" required>
                  {Array.from(new Set((rules.data || []).map((r) => r.activity))).map(
                    (activity) => (
                      <option key={activity} value={activity}>
                        {activity}
                      </option>
                    ),
                  )}
                </Select>
                <Field
                  name="address"
                  label="Endereço e localização"
                  minLength={8}
                  maxLength={500}
                  required
                />
                <Field
                  name="capacity"
                  label="Capacidade instalada (unidade da regra)"
                  type="number"
                  min={0}
                  step="any"
                  required
                />
                <Field
                  name="area"
                  label="Área do empreendimento (m²)"
                  type="number"
                  min={0}
                  step="any"
                  required
                />
                <Field
                  name="latitude"
                  label="Latitude (opcional)"
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                />
                <Field
                  name="longitude"
                  label="Longitude (opcional)"
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                />
              </>
            ) : (
              <>
                <Field
                  name="name"
                  label="Razão social / nome"
                  required
                  minLength={3}
                  maxLength={200}
                />
                <Field
                  name="registration"
                  label="CNPJ ou identificador fictício da demonstração"
                  required
                  minLength={5}
                  maxLength={30}
                />
                <Field
                  name="representative"
                  label="Responsável legal"
                  minLength={3}
                  maxLength={160}
                  required
                />
                <Field name="email" label="E-mail de contato (opcional)" type="email" />
                <Field name="phone" label="Telefone (opcional)" maxLength={30} />
                {user.role !== 'applicant' && (
                  <Select
                    name="ownerId"
                    label="Requerente responsável pela organização"
                    required
                    defaultValue=""
                  >
                    <option value="">Selecione…</option>
                    {team.data
                      ?.filter((p) => p.role === 'applicant' && p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.email}
                        </option>
                      ))}
                  </Select>
                )}
                <p className="wide small muted">
                  Neste ambiente, utilize apenas informações fictícias.
                </p>
              </>
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function DocumentsView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('documents'),
    [search, setSearch] = useState(''),
    [review, setReview] = useState<Entity | null>(null),
    [error, setError] = useState('');
  const list = (result.data || []).filter((d) =>
    `${d.filename} ${d.protocol}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="GESTÃO DOCUMENTAL"
        title="Documentos"
        description="Anexos, versões, recebimentos e análises com integridade verificável."
      />
      <section className="card">
        <div className="list-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Pesquisar arquivo ou protocolo"
          />
          <span className="small muted">PDF, PNG e JPEG · até 10 MB</span>
        </div>
        <ErrorBox error={error} />
        <Loaded data={result.data} error={result.error}>
          {list.length ? (
            <Table headers={['Arquivo / processo', 'Versão', 'Situação', 'Integridade', 'Ações']}>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.filename}</strong>
                    <small className="cell-sub">
                      <Link href={'/processos/' + d.case_id}>{d.protocol || 'Rascunho'}</Link>
                    </small>
                  </td>
                  <td>{d.version}</td>
                  <td>
                    <Badge status={d.status} />
                    <small className="cell-sub">
                      {d.scan_status === 'demo_unscanned'
                        ? 'Antivírus pendente · demonstração'
                        : d.scan_status}
                    </small>
                  </td>
                  <td>
                    <code className="hash" title={d.sha256}>
                      {d.sha256.slice(0, 14)}…
                    </code>
                  </td>
                  <td>
                    <div className="row-actions">
                      <a href={'/api/documents/' + d.id + '/download'} className="table-link">
                        Baixar
                      </a>
                      {hasRole(user, 'protocol') && d.status === 'sent' && (
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await api('documents/' + d.id + '/receive', {});
                              changed();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Receber
                        </Button>
                      )}
                      {hasRole(user, 'analyst') && d.status === 'received' && (
                        <Button variant="secondary" onClick={() => setReview(d)}>
                          Analisar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Nenhum documento encontrado"
              detail="Os anexos são enviados dentro de cada processo."
            />
          )}
        </Loaded>
      </section>
      {review && (
        <Modal title={'Analisar ' + review.filename} onClose={() => setReview(null)}>
          <ActionForm
            label="Registrar análise"
            submit={async (f) => {
              await api('documents/' + review.id + '/review', {
                status: field(f, 'status'),
                note: field(f, 'note'),
              });
              changed();
              setReview(null);
            }}
          >
            <Select label="Resultado" name="status">
              <option value="accepted">Aceito</option>
              <option value="reservation">Aceito com ressalvas</option>
              <option value="rejected">Rejeitado</option>
            </Select>
            <Area
              name="note"
              label="Justificativa técnica"
              minLength={8}
              maxLength={3000}
              required
            />
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function LicensesView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('licenses');
  return (
    <>
      <PageHeading
        eyebrow="ATOS E LICENCIAMENTO"
        title="Licenças"
        description="Modelos aprovados pela autoridade, vinculados ao processo e ao parecer."
      />
      <div className="callout warning">
        <FileText size={18} />
        As licenças desta versão são modelos de demonstração, sem validade jurídica ou assinatura
        eletrônica oficial.
      </div>
      <section className="card">
        <Loaded data={result.data} error={result.error}>
          {result.data?.length ? (
            <Table
              headers={[
                'Licença-modelo',
                'Empreendimento / processo',
                'Situação',
                'Validade',
                'Ações',
              ]}
            >
              {result.data.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.number}</strong>
                  </td>
                  <td>
                    {l.establishment_name}
                    <small className="cell-sub">
                      <Link href={'/processos/' + l.case_id}>{l.protocol}</Link>
                    </small>
                  </td>
                  <td>
                    <Badge status={l.status} />
                  </td>
                  <td>{date(l.valid_until)}</td>
                  <td>
                    <div className="row-actions">
                      <a className="table-link" href={'/api/licenses/' + l.id + '/pdf'}>
                        Baixar PDF
                      </a>
                      <Link className="table-link" href={'/processos/' + l.case_id}>
                        Abrir processo
                      </Link>
                      {l.status === 'published_demo' && (
                        <Link className="table-link" href={'/verificar/' + l.verification_code}>
                          Verificar
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Nenhuma licença-modelo emitida"
              detail="Conclua a documentação e o parecer e encaminhe o processo à autoridade."
            />
          )}
        </Loaded>
      </section>
    </>
  );
}
export function ConditionsView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('conditions'),
    [selected, setSelected] = useState<Entity | null>(null),
    [action, setAction] = useState('evidence');
  return (
    <>
      <PageHeading
        eyebrow="MONITORAMENTO CONTÍNUO"
        title="Condicionantes"
        description="Obrigações, responsáveis, comprovações e análise de cumprimento."
      />
      <div className="callout">
        Um prazo vencido sinaliza necessidade de acompanhamento. O sistema não aplica multa
        automaticamente.
      </div>
      <section className="card">
        <Loaded data={result.data} error={result.error}>
          {result.data?.length ? (
            <Table
              headers={['Condicionante / licença', 'Responsável', 'Prazo', 'Situação', 'Ações']}
            >
              {result.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.title}</strong>
                    <small className="cell-sub">
                      {c.license_number} ·{' '}
                      <Link href={'/processos/' + c.case_id}>{c.protocol}</Link>
                    </small>
                  </td>
                  <td>{c.responsible}</td>
                  <td
                    className={
                      c.status !== 'fulfilled' &&
                      String(c.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10)
                        ? 'overdue'
                        : ''
                    }
                  >
                    {date(c.due_date)}
                  </td>
                  <td>
                    <Badge status={c.status} />
                  </td>
                  <td>
                    {hasRole(user, 'applicant', 'protocol') && c.status !== 'fulfilled' && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected(c);
                          setAction('evidence');
                        }}
                      >
                        Enviar comprovação
                      </Button>
                    )}
                    {hasRole(user, 'analyst', 'inspector') && c.status === 'submitted' && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected(c);
                          setAction('review');
                        }}
                      >
                        Analisar comprovação
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Nenhuma condicionante cadastrada"
              detail="A autoridade cadastra as obrigações na seção da licença de cada processo."
            />
          )}
        </Loaded>
      </section>
      {selected && (
        <Modal
          title={action === 'evidence' ? 'Enviar comprovação' : 'Analisar comprovação'}
          onClose={() => setSelected(null)}
        >
          <p className="modal-intro">{selected.title}</p>
          <ActionForm
            label={action === 'evidence' ? 'Enviar comprovação' : 'Registrar análise'}
            submit={async (f) => {
              if (action === 'evidence') {
                const form = new FormData();
                form.set('file', f.get('file')!);
                form.set('requirementKey', 'evidence_' + selected.id.replaceAll('-', ''));
                const doc = await api('documents/cases/' + selected.case_id, form);
                await api('conditions/' + selected.id + '/evidence', { documentId: doc.id });
              } else
                await api('conditions/' + selected.id + '/review', {
                  status: field(f, 'status'),
                  note: field(f, 'note'),
                });
              changed();
              setSelected(null);
            }}
          >
            {action === 'evidence' ? (
              <Field
                name="file"
                label="Arquivo comprobatório"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
            ) : (
              <>
                <Select name="status" label="Resultado">
                  <option value="fulfilled">Cumprida</option>
                  <option value="rejected">Comprovação rejeitada</option>
                </Select>
                <Area label="Justificativa" name="note" required minLength={8} maxLength={2000} />
              </>
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function NoticesView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('notices'),
    [selected, setSelected] = useState<Entity | null>(null),
    [action, setAction] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="COMUNICAÇÃO PROCESSUAL"
        title="Notificações"
        description="Da minuta à ciência demonstrativa, com evidências e prazo parametrizado."
      />
      <section className="card">
        <Loaded data={result.data} error={result.error}>
          {result.data?.length ? (
            <Table
              headers={[
                'Notificação / processo',
                'Situação',
                'Prazo',
                'Ciência / vencimento',
                'Ações',
              ]}
            >
              {result.data.map((n) => (
                <tr key={n.id}>
                  <td>
                    <strong>{n.title}</strong>
                    <small className="cell-sub">
                      <Link href={'/processos/' + n.case_id}>{n.protocol}</Link>
                    </small>
                  </td>
                  <td>
                    <Badge status={n.status} />
                  </td>
                  <td>
                    {n.days} dias {n.counting === 'business' ? 'úteis' : 'corridos'}
                    <small className="cell-sub">{n.deadline_basis}</small>
                  </td>
                  <td>
                    {n.acknowledged_at ? datetime(n.acknowledged_at) : 'Ciência não registrada'}
                    <small className="cell-sub">Vencimento: {date(n.due_date)}</small>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSelected(n);
                          setAction('view');
                        }}
                      >
                        Ver minuta
                      </Button>
                      {n.status === 'draft' && hasRole(user, 'authority') && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelected(n);
                            setAction('approve');
                          }}
                        >
                          Aprovar
                        </Button>
                      )}
                      {n.status === 'approved' && hasRole(user, 'protocol', 'authority') && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelected(n);
                            setAction('dispatch_demo');
                          }}
                        >
                          Simular expedição
                        </Button>
                      )}
                      {n.status === 'dispatched_demo' && hasRole(user, 'protocol', 'authority') && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelected(n);
                            setAction('acknowledge_demo');
                          }}
                        >
                          Registrar ciência
                        </Button>
                      )}
                      {n.status === 'acknowledged_demo' &&
                        hasRole(user, 'protocol', 'authority') && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelected(n);
                              setAction('answer');
                            }}
                          >
                            Concluir resposta
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="Nenhuma notificação cadastrada"
              detail="O técnico ou protocolo prepara a minuta dentro do processo."
            />
          )}
        </Loaded>
      </section>
      {selected && (
        <Modal
          title={
            action === 'view'
              ? 'Minuta de notificação'
              : action === 'approve'
                ? 'Aprovar notificação'
                : action === 'dispatch_demo'
                  ? 'Expedição demonstrativa'
                  : action === 'acknowledge_demo'
                    ? 'Ciência demonstrativa'
                    : 'Registrar resposta'
          }
          onClose={() => setSelected(null)}
          wide
        >
          <div className="prose-text">{selected.text}</div>
          {action !== 'view' && (
            <ActionForm
              label="Confirmar operação"
              submit={async (f) => {
                await api('notices/' + selected.id + '/action', {
                  action,
                  ...(action === 'acknowledge_demo'
                    ? {
                        evidence: field(f, 'evidence'),
                        acknowledgedAt: new Date(field(f, 'at')).toISOString(),
                      }
                    : {}),
                });
                changed();
                setSelected(null);
              }}
            >
              {action === 'acknowledge_demo' ? (
                <>
                  <Field
                    label="Data e hora da ciência demonstrativa"
                    name="at"
                    type="datetime-local"
                    step={1}
                    required
                  />
                  <Area
                    label="Evidência da ciência / referência do comprovante"
                    name="evidence"
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </>
              ) : (
                <p className="wide">
                  {action === 'dispatch_demo'
                    ? 'Esta simulação registra a expedição, sem enviar mensagens ou comprovar ciência jurídica.'
                    : 'Esta operação ficará registrada na auditoria do processo.'}
                </p>
              )}
              <Check label="Conferi os dados e confirmo esta operação demonstrativa" required />
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
export function InspectionsView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('inspections'),
    cases = useApi<Entity[]>('cases'),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState<Entity | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="FISCALIZAÇÃO AMBIENTAL"
        title="Vistorias e inspeções"
        description="Agendamento, relatório de campo e vínculo ao dossiê ambiental."
        actions={
          hasRole(user, 'inspector', 'authority') && (
            <Button onClick={() => setModal('new')}>
              <Plus size={17} />
              Agendar vistoria
            </Button>
          )
        }
      />
      <section className="card">
        <Loaded data={result.data} error={result.error}>
          {result.data?.length ? (
            <Table headers={['Vistoria', 'Processo', 'Agendamento', 'Situação', 'Ações']}>
              {result.data.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.title}</strong>
                    <small className="cell-sub">
                      {i.report || 'Relatório ainda não registrado'}
                    </small>
                  </td>
                  <td>
                    {i.case_id ? (
                      <Link className="table-link" href={'/processos/' + i.case_id}>
                        {i.protocol || 'Rascunho'}
                      </Link>
                    ) : (
                      'Denúncia vinculada'
                    )}
                  </td>
                  <td>{datetime(i.scheduled_at)}</td>
                  <td>
                    <Badge status={i.status} />
                  </td>
                  <td>
                    {i.status === 'scheduled' && hasRole(user, 'inspector') && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected(i);
                          setModal('report');
                        }}
                      >
                        Registrar relatório
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Nenhuma vistoria agendada" />
          )}
        </Loaded>
      </section>
      {modal && (
        <Modal
          title={modal === 'new' ? 'Agendar vistoria' : 'Registrar relatório de vistoria'}
          onClose={() => setModal('')}
        >
          <ActionForm
            label={modal === 'new' ? 'Agendar' : 'Concluir vistoria'}
            submit={async (f) => {
              if (modal === 'new')
                await api('inspections', {
                  title: field(f, 'title'),
                  scheduledAt: new Date(field(f, 'at')).toISOString(),
                  caseId: field(f, 'caseId') || null,
                  complaintId: null,
                });
              else
                await api('inspections/' + selected!.id + '/report', {
                  report: field(f, 'report'),
                });
              changed();
              setModal('');
            }}
          >
            {modal === 'new' ? (
              <>
                <Field
                  label="Objeto da vistoria"
                  name="title"
                  minLength={5}
                  maxLength={200}
                  required
                />
                <Select label="Processo" name="caseId" required defaultValue="">
                  <option value="">Selecione…</option>
                  {cases.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.protocol || 'Rascunho'} · {c.establishment_name}
                    </option>
                  ))}
                </Select>
                <Field name="at" label="Data e hora agendada" type="datetime-local" required />
              </>
            ) : (
              <Area
                label="Relatório e constatações"
                name="report"
                minLength={30}
                maxLength={15000}
                required
                rows={10}
              />
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function ComplaintsView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('complaints'),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState<Entity | null>(null);
  const graph: Record<string, string[]> = {
    received: ['screening'],
    screening: ['diligence', 'investigation'],
    diligence: ['investigation'],
    investigation: ['concluded'],
    concluded: ['archived'],
    archived: [],
  };
  return (
    <>
      <PageHeading
        eyebrow="OUVIDORIA AMBIENTAL"
        title="Denúncias"
        description="Recebimento, triagem e apuração, com acesso restrito ao necessário."
        actions={
          hasRole(user, 'ombudsman') && (
            <Button onClick={() => setModal('new')}>
              <Plus size={17} />
              Registrar denúncia
            </Button>
          )
        }
      />
      <div className="callout">
        <LockKeyhole size={18} />A identidade do denunciante é guardada separadamente e não aparece
        nesta listagem. O encerramento depende da apuração do objeto.
      </div>
      <section className="card">
        <Loaded data={result.data} error={result.error}>
          {result.data?.length ? (
            <Table
              headers={['Protocolo / assunto', 'Localização', 'Situação', 'Recebimento', 'Ações']}
            >
              {result.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.protocol}</strong>
                    <small className="cell-sub">{c.title}</small>
                  </td>
                  <td>{c.location}</td>
                  <td>
                    <Badge status={c.status} />
                  </td>
                  <td>{date(c.created_at)}</td>
                  <td>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelected(c);
                        setModal('detail');
                      }}
                    >
                      Detalhes
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Nenhuma denúncia cadastrada" />
          )}
        </Loaded>
      </section>
      {modal && (
        <Modal
          title={
            modal === 'new' ? 'Registrar denúncia ambiental' : selected?.protocol || 'Denúncia'
          }
          onClose={() => setModal('')}
          wide
        >
          {modal === 'new' ? (
            <ActionForm
              label="Registrar denúncia"
              submit={async (f) => {
                await api('complaints', {
                  title: field(f, 'title'),
                  narrative: field(f, 'narrative'),
                  location: field(f, 'location'),
                  contact: field(f, 'contact'),
                });
                changed();
                setModal('');
              }}
            >
              <Field label="Assunto" name="title" minLength={5} maxLength={200} required />
              <Field
                label="Localização do fato"
                name="location"
                minLength={5}
                maxLength={500}
                required
              />
              <Area
                label="Descrição do fato (sem dados pessoais do denunciante)"
                name="narrative"
                minLength={20}
                maxLength={12000}
                required
                rows={6}
              />
              <Field
                label="Contato do denunciante (opcional, protegido)"
                name="contact"
                maxLength={500}
              />
            </ActionForm>
          ) : (
            <>
              <h3>{selected?.title}</h3>
              <div className="prose-text">{selected?.narrative}</div>
              {selected?.conclusion && (
                <div className="callout">Conclusão: {selected.conclusion}</div>
              )}
              {graph[selected?.status]?.length > 0 && (
                <ActionForm
                  label="Registrar encaminhamento"
                  submit={async (f) => {
                    await api('complaints/' + selected!.id + '/transition', {
                      to: field(f, 'to'),
                      reason: field(f, 'reason'),
                    });
                    changed();
                    setModal('');
                  }}
                >
                  <Select label="Próxima etapa" name="to">
                    {graph[selected?.status].map((s) => (
                      <option key={s} value={s}>
                        {STATUS[s]}
                      </option>
                    ))}
                  </Select>
                  <Area
                    label="Apuração, motivo e fundamentação do encaminhamento"
                    name="reason"
                    minLength={15}
                    maxLength={4000}
                    required
                  />
                </ActionForm>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
const references = [
  ['Lei Complementar 140/2011', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp140.htm'],
  [
    'Lei 15.190/2025 — texto atualizado',
    'https://www2.camara.leg.br/legin/fed/lei/2025/lei-15190-8-agosto-2025-797833-normaatualizada-pl.html',
  ],
  ['Resoluções CEPRAM / BA', 'https://www.ba.gov.br/meioambiente/531/resolucoes-cepram'],
  [
    'Lei Municipal 1.625/2021 — Itaberaba',
    'https://sapl.itaberaba.ba.leg.br/media/sapl/public/normajuridica/2021/1453/lei-no_1625-2021_0333.pdf',
  ],
];
export function RulesView({ user }: { user: Entity }) {
  const result = useApi<Entity[]>('rules'),
    [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Entity | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="MOTOR NORMATIVO"
        title="Regras e legislação"
        description="Regras versionadas, requisitos documentais e referências para revisão humana."
        actions={
          hasRole(user, 'municipal_admin') && (
            <Button onClick={() => setModal(true)}>
              <Plus size={17} />
              Nova versão de regra
            </Button>
          )
        }
      />
      <div className="callout warning">
        A planilha original e os PDFs normativos ainda precisam ser incorporados e validados. As
        faixas e exigências atuais são exclusivamente demonstrativas.
      </div>
      <div className="split-layout">
        <section className="card">
          <div className="card-heading">
            <h2>Versões cadastradas</h2>
            <span className="small muted">Histórico imutável</span>
          </div>
          <Loaded data={result.data} error={result.error}>
            {result.data?.length ? (
              <Table headers={['Atividade / título', 'Versão', 'Estado', 'Vigência', '']}>
                {result.data.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.activity}</strong>
                      <small className="cell-sub">{rule.title}</small>
                    </td>
                    <td>v{rule.version}</td>
                    <td>
                      <Badge status={rule.status} />
                    </td>
                    <td>{date(rule.valid_from)}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setSelected(rule)}>
                        Consultar
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty />
            )}
          </Loaded>
        </section>
        <section className="card padded">
          <h2>Fontes para conferência</h2>
          <p className="muted small">
            Referências fornecidas no escopo. Vigência e conteúdo ainda não foram homologados no
            sistema.
          </p>
          <div className="reference-list">
            {references.map(([title, url]) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                <BookOpen size={17} />
                <span>
                  {title}
                  <small>Pendente de revisão</small>
                </span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </section>
      </div>
      {selected && (
        <Modal
          title={`Regra ${selected.activity} · v${selected.version}`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="callout">{selected.source_reference}</div>
          <h3>Faixas demonstrativas</h3>
          <Table headers={['Até', 'Porte', 'Potencial', 'Modalidade']}>
            {selected.definition.bands.map((b: Entity) => (
              <tr key={b.max}>
                <td>
                  {b.max} {selected.definition.unit}
                </td>
                <td>{b.label}</td>
                <td>{b.potential}</td>
                <td>{b.modality}</td>
              </tr>
            ))}
          </Table>
          <h3 className="spaced">Documentos do checklist</h3>
          {selected.definition.documents.map((d: Entity) => (
            <p key={d.key}>
              <CheckCircle2 size={14} /> {d.name} ·{' '}
              {d.kind === 'required' ? 'Obrigatório' : 'Condicional / dispensado'}
            </p>
          ))}
          <p className="muted small">{selected.definition.note}</p>
        </Modal>
      )}
      {modal && (
        <Modal title="Nova versão de regra demonstrativa" onClose={() => setModal(false)} wide>
          <ActionForm
            label="Salvar nova versão"
            submit={async (f) => {
              let definition;
              try {
                definition = JSON.parse(field(f, 'definition'));
              } catch {
                throw Error('A definição precisa ser um JSON válido.');
              }
              await api('rules', {
                activity: field(f, 'activity'),
                title: field(f, 'title'),
                status: field(f, 'status'),
                validFrom: field(f, 'from'),
                validUntil: field(f, 'until') || null,
                sourceReference: field(f, 'source'),
                definition,
              });
              changed();
              setModal(false);
            }}
          >
            <Field
              label="Código de atividade"
              name="activity"
              defaultValue="DEMO-MADEIRA"
              required
            />
            <Field label="Título da revisão" name="title" required minLength={4} />
            <Field label="Vigência inicial" name="from" type="date" required />
            <Field label="Vigência final (opcional)" name="until" type="date" />
            <Select label="Estado" name="status">
              <option value="draft">Rascunho</option>
              <option value="approved_demo">Aprovada para demonstração</option>
            </Select>
            <Field label="Referência / origem da revisão" name="source" required minLength={10} />
            <Area
              label="Faixas e documentos (definição estruturada, sem código executável)"
              name="definition"
              rows={15}
              defaultValue={JSON.stringify(result.data?.[0]?.definition || {}, null, 2)}
              required
            />
            <p className="small muted wide">
              Criar uma versão não altera o enquadramento congelado de processos já protocolados.
            </p>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function AuditView() {
  const result = useApi<Entity[]>('admin/audit'),
    [verification, setVerification] = useState<Entity | null>(null),
    [error, setError] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="GOVERNANÇA E RASTREABILIDADE"
        title="Auditoria"
        description="Quem fez o quê, quando e em qual processo, com cadeia de integridade verificável."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                setVerification(await api('admin/audit/verify'));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <ShieldCheck size={17} />
            Verificar integridade
          </Button>
        }
      />
      <ErrorBox error={error} />
      {verification && (
        <div className={'callout ' + (verification.valid ? 'success' : 'warning')} role="status">
          <ShieldCheck size={18} />
          {verification.valid
            ? `Cadeia íntegra: ${verification.events} eventos conferidos.`
            : 'A integridade da cadeia precisa ser investigada.'}{' '}
          A verificação local não substitui ancoragem externa independente.
          {verification.legacySerializedEvents > 0 &&
            ` ${verification.legacySerializedEvents} evento(s) da demonstração inicial conferido(s) pelo formato legado, com os hashes originais preservados.`}
        </div>
      )}
      <section className="card">
        <Loaded data={result.data} error={result.error}>
          {result.data?.length ? (
            <Table headers={['Sequência', 'Evento', 'Data e hora', 'Processo', 'Evidência']}>
              {result.data.map((a) => (
                <tr key={a.id}>
                  <td>#{a.sequence}</td>
                  <td>
                    <strong>{ACTIONS[a.action] || a.action}</strong>
                    <small className="cell-sub">Usuário: {a.payload.actorName || a.actor_id}</small>
                  </td>
                  <td className="nowrap">{datetime(a.created_at)}</td>
                  <td>
                    {a.case_id ? (
                      <Link className="table-link" href={'/processos/' + a.case_id}>
                        Abrir processo
                      </Link>
                    ) : (
                      'Gestão municipal'
                    )}
                  </td>
                  <td>
                    <details>
                      <summary>Detalhes</summary>
                      <pre>{JSON.stringify(a.payload, null, 2)}</pre>
                      <code className="hash" title={a.event_hash}>
                        {a.event_hash.slice(0, 18)}…
                      </code>
                    </details>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty />
          )}
        </Loaded>
      </section>
    </>
  );
}
export function AdministrationView({ user }: { user: Entity }) {
  const team = useApi<Entity[]>('admin/team'),
    grants = useApi<Entity[]>('admin/support-grants'),
    holidays = useApi<Entity[]>('admin/holidays'),
    dashboard = useApi('dashboard'),
    [tab, setTab] = useState('team'),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState<Entity | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="CONFIGURAÇÕES DO MUNICÍPIO"
        title="Administração"
        description="Equipe, calendário, suporte autorizado e situação das integrações."
      />
      <div className="case-tabs" role="tablist" aria-label="Administração">
        {[
          ['team', 'Equipe e perfis'],
          ['calendar', 'Calendário'],
          ['support', 'Acesso de suporte'],
          ['system', 'Integrações'],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'team' && (
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Equipe e perfis de acesso</h2>
              <p>As atribuições técnicas são separadas das funções administrativas.</p>
            </div>
            <Button onClick={() => setModal('user')}>
              <Plus size={17} />
              Adicionar pessoa
            </Button>
          </div>
          <Loaded data={team.data} error={team.error}>
            {team.data?.length ? (
              <Table headers={['Pessoa', 'E-mail', 'Perfil', 'Estado', '']}>
                {team.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>{p.email}</td>
                    <td>{ROLE_LABELS[p.role]}</td>
                    <td>
                      <Badge>{p.active ? 'Ativo' : 'Desativado'}</Badge>
                    </td>
                    <td>
                      {p.id !== user.id && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setSelected(p);
                            setModal('edit');
                          }}
                        >
                          Alterar acesso
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty />
            )}
          </Loaded>
        </section>
      )}
      {tab === 'calendar' && (
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Calendário municipal</h2>
              <p>Feriados usados apenas em prazos configurados em dias úteis.</p>
            </div>
            <Button onClick={() => setModal('holiday')}>
              <Plus size={17} />
              Cadastrar feriado
            </Button>
          </div>
          <Loaded data={holidays.data} error={holidays.error}>
            {holidays.data?.length ? (
              <Table headers={['Data', 'Descrição']}>
                {holidays.data.map((h) => (
                  <tr key={h.id}>
                    <td>{date(h.date)}</td>
                    <td>{h.name}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="Nenhum feriado cadastrado"
                detail="O calendário precisa ser validado antes de usar prazos operacionais."
              />
            )}
          </Loaded>
        </section>
      )}
      {tab === 'support' && (
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Suporte temporário do fornecedor</h2>
              <p>Somente leitura, com motivo, expiração e trilha de acesso.</p>
            </div>
            <Button onClick={() => setModal('support')}>Autorizar acesso temporário</Button>
          </div>
          <Loaded data={grants.data} error={grants.error}>
            {grants.data?.length ? (
              <Table headers={['Motivo', 'Expiração', 'Estado', '']}>
                {grants.data.map((g) => (
                  <tr key={g.id}>
                    <td>{g.reason}</td>
                    <td>{datetime(g.expires_at)}</td>
                    <td>
                      {g.revoked_at
                        ? 'Revogado'
                        : new Date(g.expires_at) > new Date()
                          ? 'Ativo'
                          : 'Expirado'}
                    </td>
                    <td>
                      {!g.revoked_at && new Date(g.expires_at) > new Date() && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelected(g);
                            setModal('revoke');
                          }}
                        >
                          Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="Nenhum acesso de suporte autorizado"
                detail="O fornecedor não pode consultar os dossiês sem sua autorização."
              />
            )}
          </Loaded>
        </section>
      )}
      {tab === 'system' && (
        <section className="card padded">
          <h2>Situação das integrações</h2>
          <p className="muted">
            A demonstração funciona localmente. Serviços oficiais só serão ativados após
            configuração e homologação.
          </p>
          <div className="integration-grid">
            {dashboard.data &&
              Object.entries(dashboard.data.system)
                .filter(([k]) => k !== 'demo')
                .map(([k, v]) => (
                  <div className="integration" key={k}>
                    <span className="integration-icon">
                      <Settings2 size={21} />
                    </span>
                    <div>
                      <strong>
                        {
                          {
                            database: 'Banco de dados',
                            storage: 'Armazenamento',
                            antivirus: 'Antimalware',
                            ai: 'Inteligência artificial',
                            officialSignature: 'Assinatura oficial',
                            officialDelivery: 'Comunicação oficial',
                          }[k]
                        }
                      </strong>
                      <p>{String(v)}</p>
                    </div>
                    <Badge>
                      {['ai', 'antivirus', 'officialSignature', 'officialDelivery'].includes(k)
                        ? 'Pendente / desligado'
                        : 'Local'}
                    </Badge>
                  </div>
                ))}
          </div>
        </section>
      )}
      {modal && (
        <Modal
          title={
            {
              user: 'Adicionar pessoa à equipe',
              edit: 'Alterar acesso',
              holiday: 'Cadastrar feriado',
              support: 'Autorizar suporte temporário',
              revoke: 'Revogar suporte',
            }[modal] || ''
          }
          onClose={() => setModal('')}
        >
          <ActionForm
            label="Confirmar"
            submit={async (f) => {
              if (modal === 'user')
                await api('admin/team', {
                  name: field(f, 'name'),
                  email: field(f, 'email'),
                  password: field(f, 'password'),
                  role: field(f, 'role'),
                });
              if (modal === 'edit')
                await api('admin/team/' + selected!.id, {
                  role: field(f, 'role'),
                  active: field(f, 'active') === 'true',
                  reason: field(f, 'reason'),
                });
              if (modal === 'holiday')
                await api('admin/holidays', { date: field(f, 'date'), name: field(f, 'name') });
              if (modal === 'support')
                await api('admin/support-grants', {
                  userId: field(f, 'userId'),
                  minutes: Number(field(f, 'minutes')),
                  reason: field(f, 'reason'),
                  confirmed: f.has('confirmed'),
                });
              if (modal === 'revoke')
                await api('admin/support-grants/' + selected!.id + '/revoke', {});
              changed();
              setModal('');
            }}
          >
            {modal === 'user' && (
              <>
                <Field name="name" label="Nome completo" required minLength={3} />
                <Field name="email" label="E-mail" type="email" required />
                <Field
                  name="password"
                  label="Senha inicial (mínimo 12 caracteres)"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </>
            )}
            {['user', 'edit'].includes(modal) && (
              <Select name="role" label="Perfil" defaultValue={selected?.role || 'applicant'}>
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
            {modal === 'edit' && (
              <>
                <Select name="active" label="Estado" defaultValue={String(selected?.active)}>
                  <option value="true">Ativo</option>
                  <option value="false">Desativado</option>
                </Select>
                <Area
                  name="reason"
                  label="Motivo da alteração"
                  minLength={10}
                  maxLength={1000}
                  required
                />
              </>
            )}
            {modal === 'holiday' && (
              <>
                <Field name="date" label="Data" type="date" required />
                <Field name="name" label="Descrição do feriado" minLength={3} required />
              </>
            )}
            {modal === 'support' && (
              <>
                <Select name="userId" label="Fornecedor" required defaultValue="">
                  <option value="">Selecione…</option>
                  {team.data
                    ?.filter((p) => p.role === 'supplier' && p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.email}
                      </option>
                    ))}
                </Select>
                <Field
                  name="minutes"
                  label="Duração em minutos (5 a 60)"
                  type="number"
                  min={5}
                  max={60}
                  required
                />
                <Area
                  name="reason"
                  label="Motivo do atendimento"
                  minLength={15}
                  maxLength={1000}
                  required
                />
                <Check
                  name="confirmed"
                  label="Autorizo acesso temporário de leitura aos dados processuais deste município"
                  required
                />
              </>
            )}
            {modal === 'revoke' && (
              <p className="wide">
                O fornecedor perderá o acesso temporário imediatamente. Deseja confirmar?
              </p>
            )}
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
export function AccountView({ user }: { user: Entity }) {
  const session = useApi('auth/me'),
    [secret, setSecret] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="IDENTIDADE E ACESSO"
        title="Minha conta"
        description="Suas credenciais, autenticação multifator e município ativo."
      />
      <div className="two-columns">
        <section className="card padded">
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge>{ROLE_LABELS[user.role]}</Badge>
          <ActionForm
            label="Trocar município"
            submit={async (f) => {
              await api('auth/municipality', { municipalityId: field(f, 'municipalityId') });
              window.location.assign('/painel');
            }}
          >
            <Select
              name="municipalityId"
              label="Município ativo"
              defaultValue={user.municipalityId}
            >
              {session.data?.memberships.map((m: Entity) => (
                <option key={m.id} value={m.id}>
                  {m.name} / {m.state}
                </option>
              ))}
            </Select>
          </ActionForm>
        </section>
        <section className="card padded">
          <h2>
            <ShieldCheck size={19} />
            Autenticação multifator
          </h2>
          <p className="muted">
            Use um aplicativo autenticador TOTP. No ambiente operacional, o MFA será obrigatório
            para servidores.
          </p>
          {!user.mfa && !secret && (
            <ActionForm
              label="Configurar autenticador"
              submit={async (f) => {
                const data = await api('auth/mfa/setup', { password: field(f, 'password') });
                setSecret(data.secret);
              }}
            >
              <Field
                name="password"
                label="Confirme a senha atual"
                type="password"
                required
                autoComplete="current-password"
              />
            </ActionForm>
          )}
          {secret && (
            <div className="callout">
              <strong>Chave do autenticador</strong>
              <code className="break">{secret}</code>
              <p className="small">Guarde-a em local privado e confirme o código abaixo.</p>
            </div>
          )}
          {!user.mfa && (
            <ActionForm
              label="Confirmar MFA"
              submit={async (f) => {
                await api('auth/mfa/verify', { code: field(f, 'code') });
                changed();
              }}
            >
              <Field
                name="code"
                label="Código de seis dígitos"
                pattern="[0-9]{6}"
                maxLength={6}
                inputMode="numeric"
                required
                autoComplete="one-time-code"
              />
            </ActionForm>
          )}
          {user.mfa && (
            <div className="callout success">
              <CheckCircle2 size={18} />
              MFA confirmado nesta sessão.
            </div>
          )}
        </section>
        <section className="card padded">
          <h2>
            <KeyRound size={19} />
            Alterar senha
          </h2>
          <ActionForm
            label="Alterar senha e entrar novamente"
            submit={async (f) => {
              if (field(f, 'password') !== field(f, 'confirmation'))
                throw Error('As novas senhas precisam ser iguais');
              await api('auth/password', {
                currentPassword: field(f, 'current'),
                password: field(f, 'password'),
              });
              window.location.assign('/login');
            }}
          >
            <Field
              name="current"
              label="Senha atual"
              type="password"
              required
              autoComplete="current-password"
            />
            <Field
              name="password"
              label="Nova senha"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
            <Field
              name="confirmation"
              label="Repita a nova senha"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </ActionForm>
        </section>
      </div>
    </>
  );
}
