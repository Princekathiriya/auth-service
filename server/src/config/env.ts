import { z } from 'zod';

// Validate environment variables once, at startup. If anything is missing or
// malformed the process exits immediately with a clear message, instead of
// failing later in some random request.
// `FOO=` in a .env file gives an empty string, not undefined. Treat it as "not set".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  CLIENT_ORIGIN: z.url(),
  MONGODB_URI: z.string().startsWith('mongodb'),
  // HS256 secret: must be long and random. Generate with: openssl rand -base64 48
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // 'strict' when the frontend and API share a site (e.g. app.example.com + api.example.com).
  // 'none' only if they are on different sites (e.g. *.vercel.app + *.onrender.com); requires HTTPS.
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  // 'console' logs emails (with their links) instead of sending them: local dev only.
  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: z.string().default('Auth Service <onboarding@resend.dev>'),
  // Google OAuth. Optional: leave all three empty to run without "Sign in with Google".
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  // Must EXACTLY match an "Authorized redirect URI" in Google Cloud Console.
  GOOGLE_REDIRECT_URI: optional(z.url()),
  // How many reverse proxies sit in front of the API (Render: 1, docker-compose: 0).
  // Decides which X-Forwarded-For entry is the real client IP. See app.ts.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // 'pretty' needs the pino-pretty dev dependency, so it's only the default in development.
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})
  // Rules that involve more than one variable.
  .refine((e) => e.EMAIL_PROVIDER !== 'resend' || !!e.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    path: ['RESEND_API_KEY'],
  })
  .refine((e) => [e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET, e.GOOGLE_REDIRECT_URI].filter(Boolean).length % 3 === 0, {
    message: 'Set all of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, or none of them',
    path: ['GOOGLE_CLIENT_ID'],
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.EMAIL_PROVIDER === 'console'), {
    // The console mailer writes reset links into the logs: anyone with log access could take over accounts.
    message: 'EMAIL_PROVIDER=console is not allowed in production',
    path: ['EMAIL_PROVIDER'],
  });

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
