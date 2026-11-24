import definition from '../src/lib/municipal-workflow.v1.json';
import { BadRequestException } from '@nestjs/common';
import type { Actor, Query, Role } from './core';
import { allow, audit } from './core';

export const municipalWorkflow = definition;

export function workflowStep(row: any) {
  return row.workflow_snapshot?.steps.find((s: any) => s.id === row.workflow_step);
}
export function requireWorkflowStep(row: any, steps: string[]) {
  if (row.workflow_step && !steps.includes(row.workflow_step))
    throw new BadRequestException(
      `A operação pertence a outra etapa do fluxograma. Etapa atual: ${row.workflow_step}.`,
    );
}
export async function advanceWorkflow(
  q: Query,
  actor: Actor,
  row: any,
  actionId: string,
  note: string,
  extra: Record<string, unknown> = {},
) {
  const step = workflowStep(row);
  if (!step)
    throw new BadRequestException('Inicie o roteiro numerado neste processo antes de avançar.');
  allow(actor, step.role as Role);
  const action = step.actions.find((a: any) => a.id === actionId);
  if (!action) throw new BadRequestException('Ação não permitida nesta etapa do fluxograma');
  const next = row.workflow_snapshot.steps.find((s: any) => s.id === action.to);
  if (!next) throw new BadRequestException('Próxima etapa ausente no roteiro congelado');
  const saved = (
    await q.query(
      'UPDATE cases SET workflow_step=$1,status=$2,workflow_data=workflow_data || $3::jsonb,revision=revision+1,updated_at=now() WHERE id=$4 RETURNING *',
      [next.id, next.status, JSON.stringify(extra), row.id],
    )
  ).rows[0];
  await audit(
    q,
    actor,
    'case.workflow_advanced',
    {
      version: row.workflow_snapshot.version,
      from: step.id,
      to: next.id,
      action: action.id,
      note,
      ...extra,
      demonstration: true,
      // Notes from technical stages are internal; administrative stages relay them.
      audience: step.role === 'analyst' ? 'internal' : 'applicant',
    },
    row.id,
  );
  return saved;
}
