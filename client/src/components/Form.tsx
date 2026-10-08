import { useId, type InputHTMLAttributes } from 'react';
import { ApiError } from '../lib/api';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Label + input + error, wired together for screen readers (htmlFor, aria-invalid, aria-describedby). */
export function Field({ label, error, hint, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {error ? (
        <p id={`${id}-error`} className="field-error">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="muted small">{hint}</p>
      ) : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="banner banner-error">{message}</p>;
}

export interface DescribedError {
  /** Stable machine-readable code from the API. Branch on THIS, never on message text. */
  code: string;
  message: string;
  fields: Record<string, string>;
}

/** Turn any thrown error into { code, message for the banner, per-field messages }. */
export function describeError(err: unknown): DescribedError {
  if (!(err instanceof ApiError)) return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', fields: {} };
  const { code } = err;
  const fields = Object.fromEntries(Object.entries(err.details ?? {}).map(([k, v]) => [k, v[0] ?? 'Invalid value']));
  if (err.status === 429) return { code, message: 'Too many attempts. Please wait a few minutes and try again.', fields };
  if (code === 'VALIDATION_ERROR') return { code, message: 'Please fix the highlighted fields.', fields };
  return { code, message: err.message, fields };
}

/** For errors the page creates itself (client-side validation). */
export function fieldError(field: string, message: string): DescribedError {
  return { code: 'VALIDATION_ERROR', message: 'Please fix the highlighted fields.', fields: { [field]: message } };
}
