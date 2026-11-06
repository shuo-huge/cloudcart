import { formatMoney } from "@cloudcart/shared";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

export function enumLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function Money({ cents, currency }: { cents: number; currency: string }) {
  return <span>{formatMoney(cents, currency)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = /paid|completed|active|succeeded|shipped/.test(status)
    ? "success"
    : /cancel|failed|refund|archived|disabled/.test(status)
      ? "danger"
      : /pending|awaiting|draft|processing|partial/.test(status)
        ? "warning"
        : "neutral";
  return <span class={`badge badge--${tone}`}>{enumLabel(status)}</span>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div class="loading">{label}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div class="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" class="button button--small" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ComponentChildren }) {
  return (
    <div class="empty-state">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ComponentChildren;
  width?: string;
}

export function DataTable<T>({ columns, rows, empty }: { columns: Array<Column<T>>; rows: T[]; empty?: string }) {
  if (rows.length === 0) return <EmptyState title={empty ?? "Nothing here yet."} />;
  return (
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key} style={column.width ? { width: column.width } : undefined}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  onChange,
}: {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <div class="pagination">
      <button type="button" class="button button--small" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span>Page {page} of {pages} · {total} total</span>
      <button type="button" class="button button--small" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div class={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header class="modal-header">
          <h2>{title}</h2>
          <button type="button" class="icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => { if (active) setData(value); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Request failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload: () => setTick((value) => value + 1) };
}

type ToastKind = "success" | "error";

const TOAST_EVENT = "cloudcart:toast";

export function toast(message: string, kind: ToastKind = "success"): void {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, kind } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: ToastKind }>>([]);
  useEffect(() => {
    let counter = 0;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      counter += 1;
      const id = counter;
      setToasts((current) => [...current, { id, ...detail }]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4000);
    };
    window.addEventListener(TOAST_EVENT, listener);
    return () => window.removeEventListener(TOAST_EVENT, listener);
  }, []);
  return (
    <div class="toaster" aria-live="polite">
      {toasts.map((item) => <div key={item.id} class={`toast toast--${item.kind}`}>{item.message}</div>)}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}
