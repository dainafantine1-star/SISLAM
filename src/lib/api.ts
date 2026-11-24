'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from './uploads';
export type Entity = Record<string, any>;
export const ROLE_LABELS: Record<string, string> = {
  applicant: 'Requerente',
  protocol: 'Departamento administrativo',
  analyst: 'Departamento técnico',
  authority: 'Autoridade',
  inspector: 'Fiscalização',
  ombudsman: 'Ouvidoria',
  municipal_admin: 'Administração municipal',
  supplier: 'Suporte autorizado',
};
export const STATUS: Record<string, string> = {
  draft: 'Rascunho',
  filed: 'Protocolado',
  screening: 'Triagem',
  requirements: 'Em complementação',
  analysis: 'Análise técnica',
  decision: 'Aguardando decisão',
  closed: 'Encerrado',
  sent: 'Enviado',
  received: 'Recebido',
  accepted: 'Aceito',
  reservation: 'Com ressalvas',
  rejected: 'Rejeitado',
  reviewed: 'Revisado',
  approved_demo: 'Aprovado · modelo',
  published_demo: 'Publicado · modelo',
  pending: 'Pendente',
  submitted: 'Comprovação enviada',
  fulfilled: 'Cumprida',
  approved: 'Aprovada',
  dispatched_demo: 'Expedida · demonstração',
  acknowledged_demo: 'Ciência · demonstração',
  answered: 'Respondida',
  diligence: 'Diligência',
  investigation: 'Em apuração',
  concluded: 'Concluída',
  archived: 'Arquivada',
  scheduled: 'Agendada',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  favorable: 'Favorável',
  favorable_reservations: 'Favorável com ressalvas e condicionantes',
  unfavorable: 'Desfavorável',
  complement: 'Complementação',
};
export const ACTIONS: Record<string, string> = {
  'case.created': 'Requerimento criado',
  'case.workflow_started': 'Roteiro municipal adotado',
  'case.workflow_advanced': 'Etapa do fluxograma registrada',
  'case.classification_reviewed': 'Enquadramento revisado pelo técnico',
  'case.refused_demo': 'Indeferimento demonstrativo registrado',
  'support.resource_accessed': 'Consulta pelo suporte autorizado',
  'case.filed': 'Requerimento protocolado',
  'case.transition': 'Movimentação do processo',
  'document.uploaded': 'Documento anexado',
  'document.received': 'Recebimento administrativo',
  'document.reviewed': 'Análise de documento',
  'opinion.version_created': 'Parecer técnico registrado',
  'license.approved_demo': 'Modelo de licença aprovado',
  'license.published_demo': 'Modelo de licença publicado',
  'condition.created': 'Condicionante cadastrada',
  'condition.evidence_submitted': 'Comprovação recebida',
  'condition.reviewed': 'Condicionante analisada',
  'case.assigned': 'Técnico atribuído',
  'organization.created': 'Organização cadastrada',
  'establishment.created': 'Empreendimento cadastrado',
  'rule.version_created': 'Nova versão de regra',
  'demo.case_initialized': 'Processo demonstrativo incluído',
  'demo.workflow_initialized': 'Exemplo do fluxograma municipal incluído',
  'demo.complaint_initialized': 'Denúncia demonstrativa recebida',
  'demo.inspection_initialized': 'Vistoria demonstrativa agendada',
  'notice.draft_created': 'Minuta de notificação criada',
  'notice.approve': 'Notificação aprovada',
  'notice.dispatch_demo': 'Expedição demonstrativa',
  'notice.acknowledge_demo': 'Ciência demonstrativa registrada',
  'complaint.received': 'Denúncia recebida',
  'complaint.transition': 'Denúncia movimentada',
  'inspection.scheduled': 'Vistoria agendada',
  'inspection.completed': 'Vistoria concluída',
  'membership.created': 'Pessoa adicionada à equipe',
  'membership.updated': 'Acesso atualizado',
  'support.authorized': 'Suporte temporário autorizado',
  'support.revoked': 'Acesso de suporte revogado',
  'calendar.holiday_saved': 'Calendário atualizado',
  'case.renewal_created': 'Renovação iniciada',
};
const connectionError =
  'Não foi possível conectar à API do SISLAM. Verifique se o serviço está disponível e tente novamente.';

async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/' + path, { cache: 'no-store', ...options });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(connectionError);
  }
  if (response.status === 401 && path !== 'auth/login') window.location.assign('/login');
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(connectionError);
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new Error(typeof message === 'string' ? message : 'Não foi possível concluir a operação');
  }
  return data as T;
}

export async function api<T = Entity>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  if (body instanceof FormData) {
    for (const value of body.values())
      if (value instanceof File && value.size > MAX_UPLOAD_BYTES)
        throw new Error(`Envie um arquivo de até ${MAX_UPLOAD_MB} MB`);
  }
  return requestApi<T>(path, {
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method,
          headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
          body: body instanceof FormData ? body : JSON.stringify(body),
        }),
  });
}
export function changed() {
  window.dispatchEvent(new Event('sislam:changed'));
}
export function useApi<T = Entity>(path: string | null) {
  const cachedPath = useRef<string | null>(null);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    if (cachedPath.current !== path) {
      setData(null);
      cachedPath.current = path;
    }
    setError('');
    void requestApi<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [path, version]);
  useEffect(() => {
    window.addEventListener('sislam:changed', reload);
    return () => window.removeEventListener('sislam:changed', reload);
  }, [reload]);
  return { data, error, reload };
}
export const date = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia' }).format(
        new Date(String(value).slice(0, 10) + 'T12:00:00Z'),
      )
    : '—';
export const datetime = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Bahia',
      }).format(new Date(String(value)))
    : '—';
export const field = (f: FormData, k: string) => String(f.get(k) || '').trim();
export const hasRole = (user: Entity, ...roles: string[]) => roles.includes(user.role);
