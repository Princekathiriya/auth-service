// Query parameters that carry secrets. They must never be written to logs.
const SENSITIVE_QUERY_PARAMS = ['code', 'state', 'token'];

/** "/auth/google/callback?code=abc&state=xyz" -> "/auth/google/callback?code=[REDACTED]&state=[REDACTED]" */
export function redactUrl(url: string) {
  const i = url.indexOf('?');
  if (i === -1) return url;
  const params = new URLSearchParams(url.slice(i + 1));
  let changed = false;
  for (const key of SENSITIVE_QUERY_PARAMS) {
    if (params.has(key)) {
      params.set(key, '[REDACTED]');
      changed = true;
    }
  }
  return changed ? `${url.slice(0, i)}?${params.toString().replaceAll('%5BREDACTED%5D', '[REDACTED]')}` : url;
}

/**
 * pino-http request serializer. pino logs the query string TWICE: inside `url` and again as
 * a parsed `query` object. Redacting only the url still leaked the OAuth code, so we drop
 * `query` entirely (the redacted url already shows the params).
 */
export function serializeRequest<T extends { url: string; query?: unknown }>(req: T) {
  const { query: _query, ...rest } = req;
  return { ...rest, url: redactUrl(req.url) };
}
