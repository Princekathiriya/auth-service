import { ApiError } from './api';

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
