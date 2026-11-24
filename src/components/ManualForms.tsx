'use client';
import { useState } from 'react';
import { api, changed, field, type Entity } from '@/lib/api';
import { ActionForm, Area, Button, Field, Select } from './ui';

type DocumentInput = { key: string; name: string; kind: string; condition?: string };
const blankDocument = (): DocumentInput => ({ key: '', name: '', kind: '' });

export function ChecklistFields({
  value,
  onChange,
  conditional = false,
}: {
  value: DocumentInput[];
  onChange: (value: DocumentInput[]) => void;
  conditional?: boolean;
}) {
  function update(index: number, key: keyof DocumentInput, text: string) {
    onChange(value.map((doc, i) => (i === index ? { ...doc, [key]: text } : doc)));
  }
  return (
    <section className="manual-fields wide" aria-label="Documentos exigidos">
      <h3>Documentos exigidos</h3>
      <p className="small muted">
        Informe os documentos e a aplicabilidade conforme a referência analisada.
      </p>
      {value.map((doc, i) => (
        <div className="manual-row form-grid" key={i}>
          <Field
            label={`Chave do documento ${i + 1}`}
            value={doc.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            pattern="[a-z0-9_-]{2,60}"
            minLength={2}
            maxLength={60}
            required
          />
          <Field
            label={`Nome do documento ${i + 1}`}
            value={doc.name}
            onChange={(e) => update(i, 'name', e.target.value)}
            minLength={3}
            maxLength={150}
            required
          />
          <Select
            label={`Exigência do documento ${i + 1}`}
            value={doc.kind}
            onChange={(e) => update(i, 'kind', e.target.value)}
            required
          >
            <option value="">Selecione…</option>
            <option value="required">Obrigatório</option>
            <option value="waived">Dispensado</option>
            {conditional && <option value="conditional">Condicional</option>}
          </Select>
          {doc.kind === 'conditional' && (
            <Field
              label={`Hipótese do documento ${i + 1}`}
              value={doc.condition || ''}
              onChange={(e) => update(i, 'condition', e.target.value)}
              maxLength={300}
              required
            />
          )}
          {value.length > 1 && (
            <Button variant="ghost" onClick={() => onChange(value.filter((_, j) => i !== j))}>
              Remover documento {i + 1}
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={value.length >= 30}
        onClick={() => onChange([...value, blankDocument()])}
      >
        Adicionar documento
      </Button>
    </section>
  );
}

export function RuleForm({ onDone }: { onDone: () => void }) {
  const [documents, setDocuments] = useState<DocumentInput[]>([blankDocument()]);
  const [bands, setBands] = useState([{ max: '', label: '', potential: '', modality: '' }]);
  function update(index: number, key: keyof (typeof bands)[number], text: string) {
    setBands((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: text } : row)));
  }
  return (
    <ActionForm
      label="Salvar nova versão"
      submit={async (f) => {
        await api('rules', {
          activity: field(f, 'activity'),
          title: field(f, 'title'),
          status: field(f, 'status'),
          validFrom: field(f, 'from'),
          validUntil: field(f, 'until') || null,
          sourceReference: field(f, 'source'),
          definition: {
            unit: field(f, 'unit'),
            note: field(f, 'note'),
            documents,
            bands: bands.map((band) => ({ ...band, max: Number(band.max) })),
          },
        });
        changed();
        onDone();
      }}
    >
      <Field label="Código de atividade" name="activity" minLength={3} maxLength={80} required />
      <Field label="Título da revisão" name="title" minLength={4} maxLength={200} required />
      <Field label="Vigência inicial" name="from" type="date" required />
      <Field label="Vigência final (opcional)" name="until" type="date" />
      <Select label="Estado" name="status">
        <option value="draft">Rascunho</option>
        <option value="approved_demo">Aprovada para teste</option>
      </Select>
      <Field label="Unidade de medida da capacidade" name="unit" maxLength={60} required />
      <Area
        label="Referência / origem da revisão"
        name="source"
        minLength={10}
        maxLength={2000}
        required
      />
      <section className="manual-fields wide" aria-label="Faixas de enquadramento">
        <h3>Faixas de enquadramento</h3>
        <p className="small muted">
          Preencha os limites em ordem crescente. Nenhuma faixa é presumida pelo sistema.
        </p>
        {bands.map((band, i) => (
          <div className="manual-row form-grid" key={i}>
            <Field
              label={`Limite superior da faixa ${i + 1}`}
              value={band.max}
              onChange={(e) => update(i, 'max', e.target.value)}
              type="number"
              min="0.000000001"
              step="any"
              required
            />
            <Field
              label={`Porte da faixa ${i + 1}`}
              value={band.label}
              onChange={(e) => update(i, 'label', e.target.value)}
              maxLength={80}
              required
            />
            <Select
              label={`Potencial poluidor da faixa ${i + 1}`}
              value={band.potential}
              onChange={(e) => update(i, 'potential', e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              <option value="baixo">Baixo</option>
              <option value="médio">Médio</option>
              <option value="alto">Alto</option>
            </Select>
            <Field
              label={`Modalidade da faixa ${i + 1}`}
              value={band.modality}
              onChange={(e) => update(i, 'modality', e.target.value)}
              maxLength={100}
              required
            />
            {bands.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => setBands((rows) => rows.filter((_, j) => i !== j))}
              >
                Remover faixa {i + 1}
              </Button>
            )}
          </div>
        ))}
        <Button
          variant="secondary"
          disabled={bands.length >= 15}
          onClick={() =>
            setBands((rows) => [...rows, { max: '', label: '', potential: '', modality: '' }])
          }
        >
          Adicionar faixa
        </Button>
      </section>
      <ChecklistFields value={documents} onChange={setDocuments} conditional />
      <Area label="Observações (opcional)" name="note" maxLength={1000} />
      <p className="small muted wide">
        A versão anterior e a regra congelada no protocolo são preservadas. O cadastro não constitui
        homologação normativa.
      </p>
    </ActionForm>
  );
}

export function ClassificationForm({
  process: c,
  onDone,
}: {
  process: Entity;
  onDone: () => void;
}) {
  const [documents, setDocuments] = useState<DocumentInput[]>(() =>
    c.classification?.requirements?.length
      ? c.classification.requirements.map((doc: DocumentInput) => ({
          ...doc,
          kind: doc.kind === 'conditional' ? '' : doc.kind,
        }))
      : [blankDocument()],
  );
  return (
    <ActionForm
      label="Registrar revisão técnica"
      submit={async (f) => {
        await api(`cases/${c.id}/classification`, {
          label: field(f, 'label'),
          potential: field(f, 'potential'),
          modality: field(f, 'modality'),
          source: field(f, 'source'),
          reason: field(f, 'reason'),
          requirements: documents,
        });
        changed();
        onDone();
      }}
    >
      <Field
        name="label"
        label="Porte ambiental"
        defaultValue={c.classification?.label || ''}
        minLength={3}
        maxLength={80}
        required
      />
      <Select
        name="potential"
        label="Potencial poluidor"
        defaultValue={c.classification?.potential || ''}
        required
      >
        <option value="">Selecione…</option>
        <option value="baixo">Baixo</option>
        <option value="médio">Médio</option>
        <option value="alto">Alto</option>
      </Select>
      <Field
        name="modality"
        label="Modalidade de licenciamento"
        defaultValue={c.classification?.modality || ''}
        minLength={3}
        maxLength={100}
        required
      />
      <Area
        name="source"
        label="Referência usada na revisão"
        minLength={12}
        maxLength={2000}
        required
      />
      <Area
        name="reason"
        label="Justificativa técnica (a proposta anterior será preservada)"
        minLength={30}
        maxLength={4000}
        required
      />
      <ChecklistFields value={documents} onChange={setDocuments} />
    </ActionForm>
  );
}
