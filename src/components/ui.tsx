'use client';
import { useEffect, useRef, useState } from 'react';
import { X, LoaderCircle, Inbox, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { STATUS, Entity } from '@/lib/api';
export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return (
    <button type="button" className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input aria-label={label} {...props} />
    </label>
  );
}
export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} {...props}>{children}</select>
    </label>
  );
}
export function Area({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="field wide">
      <span>{label}</span>
      <textarea aria-label={label} {...props} />
    </label>
  );
}
export function Check({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}
export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  return (
    <span className={`badge ${status || ''}`}>{children || STATUS[status || ''] || status}</span>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Carregando…
    </div>
  );
}
export function Empty({
  title = 'Nenhum registro encontrado',
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="feedback error" role="alert">
      <AlertCircle size={18} />
      {error}
    </div>
  ) : null;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Pesquisar…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={18} />
      <span className="sr-only">{placeholder}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      className={`modal ${wide ? 'large' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <Button variant="ghost" onClick={onClose} aria-label="Fechar janela">
          <X size={20} />
        </Button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function ActionForm({
  children,
  submit,
  label = 'Salvar',
  onDone,
}: {
  children: React.ReactNode;
  submit: (form: FormData) => Promise<unknown>;
  label?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <form
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        setSuccess(false);
        try {
          await submit(form);
          setSuccess(true);
          onDone?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Não foi possível salvar');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || !hydrated} className="form-grid">
        {children}
      </fieldset>
      <ErrorBox error={error} />
      {success && (
        <div className="feedback success" role="status">
          <CheckCircle2 size={17} />
          Operação registrada.
        </div>
      )}
      <div className="form-actions">
        <Button type="submit" disabled={busy || !hydrated}>
          {busy ? (
            <>
              <LoaderCircle size={16} className="spin" />
              Salvando…
            </>
          ) : (
            label
          )}
        </Button>
      </div>
    </form>
  );
}
export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Kpi({
  label,
  value,
  detail,
  icon,
  color = 'green',
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span>{label}</span>
        <span className={`kpi-icon ${color}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail || 'No município selecionado'}</p>
    </div>
  );
}
