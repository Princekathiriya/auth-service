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

/** Turn any thrown error into { message for the banner, per-field messages }. */
export function describeError(err: unknown): { message: string; fields: Record<string, string> } {
  if (!(err instanceof ApiError)) return { message: 'Something went wrong. Please try again.', fields: {} };
  const fields = Object.fromEntries(Object.entries(err.details ?? {}).map(([k, v]) => [k, v[0] ?? 'Invalid value']));
  if (err.status === 429) return { message: 'Too many attempts. Please wait a few minutes and try again.', fields };
  if (err.code === 'VALIDATION_ERROR') return { message: 'Please fix the highlighted fields.', fields };
  return { message: err.message, fields };
}
