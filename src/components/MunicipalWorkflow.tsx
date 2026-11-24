'use client';
import { useState } from 'react';
import { api, changed, field, Entity, ROLE_LABELS, datetime } from '@/lib/api';
import { ActionForm, Area, Button, Check, Field, Modal } from './ui';

export function MunicipalWorkflow({
  process: c,
  user,
  selectTab,
}: {
  process: Entity;
  user: Entity;
  selectTab: (tab: string) => void;
}) {
  const [action, setAction] = useState<Entity | null>(null),
    [starting, setStarting] = useState(false);
  const step = c.workflow?.current;
  const canAct = step?.role === user.role;
  const uploadKey: Record<string, string> = {
    '13': 'extra_pagamento',
    '15b': 'extra_estudo',
    '23': 'extra_relatorio',
  };
  const uploadLabels: Record<string, string> = {
    '13': 'Comprovante fictício de pagamento',
    '15b': 'Estudo ambiental revisado',
    '23': 'Relatório periódico de condicionantes',
  };
  const lastTechnical = c.timeline.find(
    (event: Entity) =>
      event.action === 'case.workflow_advanced' && event.payload.audience === 'internal',
  );
  if (!step)
    return (
      <section className="card padded municipal-workflow">
        <h2>Fluxograma municipal numerado</h2>
        <p>
          Este processo foi criado antes do roteiro de 25 etapas. Os documentos, pareceres e
          registros anteriores estão preservados.
        </p>
        {['applicant', 'protocol'].includes(user.role) && c.status !== 'closed' && (
          <Button variant="secondary" onClick={() => setStarting(true)}>
            Adotar roteiro numerado
          </Button>
        )}
        {starting && (
          <Modal title="Adotar roteiro numerado" onClose={() => setStarting(false)}>
            <p>
              O acompanhamento começa na etapa 1. Nenhuma etapa anterior será marcada como cumprida.
              A regra já congelada e os documentos originais serão preservados.
            </p>
            <ActionForm
              label="Iniciar roteiro"
              submit={async (f) => {
                await api(`cases/${c.id}/workflow/start`, {
                  reason: field(f, 'reason'),
                  revision: c.revision,
                });
                changed();
                setStarting(false);
              }}
            >
              <Area name="reason" label="Justificativa da adoção" minLength={20} required />
              <Check label="Confirmo a adoção do roteiro demonstrativo." required />
            </ActionForm>
          </Modal>
        )}
      </section>
    );
  return (
    <section className="card padded municipal-workflow" aria-label="Fluxograma municipal numerado">
      <div className="workflow-current">
        <span className="workflow-number">{step.number || step.id}</span>
        <div>
          <span className="eyebrow">ETAPA ATUAL · {ROLE_LABELS[step.role]}</span>
          <h2>{step.title}</h2>
          <p>
            Roteiro {c.workflow.version} · Documento fornecido, página 81 · Sem validade jurídica
          </p>
        </div>
      </div>
      {!canAct && step.actions.length > 0 && (
        <p className="workflow-waiting">
          Aguardando {ROLE_LABELS[step.role].toLocaleLowerCase('pt-BR')}. Esta etapa só pode ser
          concluída por esse perfil.
        </p>
      )}
      {c.workflow_data.communication && (
        <div className="callout">
          <strong>Comunicação do administrativo</strong>
          <p>{c.workflow_data.communication.text}</p>
          <small>
            {datetime(c.workflow_data.communication.at)} · {c.workflow_data.communication.by}
          </small>
        </div>
      )}
      {user.role === 'protocol' && lastTechnical && (
        <div className="callout warning">
          <strong>Retorno técnico interno para conferência administrativa</strong>
          <p>{lastTechnical.payload.note}</p>
        </div>
      )}
      {c.workflow_data.fee && (
        <p>
          Taxa simulada:{' '}
          {Number(c.workflow_data.fee.amount).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })}{' '}
          · {c.workflow_data.fee.reference}. Nenhum boleto bancário foi emitido.
        </p>
      )}
      {step.id === '2' && c.related.length > 0 && (
        <div className="callout warning">
          <strong>Requerimentos anteriores deste empreendimento</strong>
          {c.related.map((item: Entity) => (
            <p key={item.id}>
              {item.protocol || 'Rascunho'} · {item.title}
            </p>
          ))}
        </div>
      )}
      {canAct && (
        <div className="row-actions">
          {['8', '9', '10', '10c', '14', '15_receipt', '23_receipt'].includes(step.id) && (
            <Button variant="secondary" onClick={() => selectTab('documents')}>
              Abrir documentação
            </Button>
          )}
          {['4', '5', '6'].includes(step.id) && (
            <p>
              Confira o enquadramento na visão geral e use “Revisar enquadramento” quando
              necessário. Na etapa 6, confirme o checklist antes de encaminhar.
            </p>
          )}
          {step.id === '18' && (
            <Button variant="secondary" onClick={() => selectTab('analysis')}>
              Registrar parecer técnico
            </Button>
          )}
          {step.id === '21' && (
            <Button variant="secondary" onClick={() => selectTab('license')}>
              Registrar licença-modelo
            </Button>
          )}
          {step.actions.map((item: Entity) => (
            <Button key={item.id} onClick={() => setAction(item)}>
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <details className="workflow-outline">
        <summary>Consultar sequência e responsáveis do fluxograma</summary>
        <ol>
          {c.workflow.steps.map((item: Entity) => (
            <li key={item.id} aria-current={item.id === step.id ? 'step' : undefined}>
              <span>{item.number || item.id}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {ROLE_LABELS[item.role]}
                  {item.actions.length
                    ? ` · Próxima: ${item.actions.map((a: Entity) => a.to).join(' / ')}`
                    : ' · Fim do ramo'}
                </small>
              </div>
            </li>
          ))}
        </ol>
        <p>
          As etapas de comunicação e recebimento associadas a 15 e 23 passam pelo administrativo,
          conforme a orientação fornecida.
        </p>
      </details>
      {action && (
        <Modal
          title={`Etapa ${step.number || step.id} · ${action.label}`}
          onClose={() => setAction(null)}
          wide
        >
          <p>{step.title}. O registro será associado ao seu usuário e incluído no histórico.</p>
          <ActionForm
            label="Registrar etapa"
            submit={async (f) => {
              const file = f.get('file');
              let revision = c.revision;
              if (file instanceof File && file.size && uploadKey[step.id]) {
                const form = new FormData();
                form.set('file', file);
                form.set('requirementKey', uploadKey[step.id]);
                const uploaded = await api(`documents/cases/${c.id}`, form);
                revision = uploaded.caseRevision;
              }
              await api(`cases/${c.id}/workflow`, {
                step: step.id,
                action: action.id,
                revision,
                note: field(f, 'note'),
                ...(field(f, 'reference') ? { reference: field(f, 'reference') } : {}),
                ...(field(f, 'amount') ? { amount: Number(field(f, 'amount')) } : {}),
              });
              changed();
              setAction(null);
            }}
          >
            <Area
              name="note"
              label={
                step.role === 'protocol'
                  ? 'Registro administrativo e comunicação'
                  : step.role === 'analyst'
                    ? 'Registro técnico interno e justificativa'
                    : 'Informações enviadas ao administrativo'
              }
              required
              minLength={20}
              maxLength={10000}
              rows={5}
            />
            {['4', '12'].includes(step.id) && (
              <Field
                name="reference"
                label={
                  step.id === '4'
                    ? 'Referência conferida para competência (demonstrativa)'
                    : 'Referência da taxa simulada'
                }
                required
                maxLength={500}
              />
            )}
            {step.id === '12' && (
              <Field
                name="amount"
                label="Valor da taxa simulada (R$)"
                type="number"
                required
                min="0.01"
                step="0.01"
              />
            )}
            {uploadKey[step.id] && (
              <Field
                name="file"
                label={uploadLabels[step.id]}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
              />
            )}
            <Check
              label="Confirmo o registro nesta etapa de demonstração, sem validade jurídica."
              required
            />
          </ActionForm>
        </Modal>
      )}
    </section>
  );
}
