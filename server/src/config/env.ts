import { z } from 'zod';

// Validate environment variables once, at startup. If anything is missing or
// malformed the process exits immediately with a clear message, instead of
// failing later in some random request.
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
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Auth Service <onboarding@resend.dev>'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})
  // Rules that involve more than one variable.
  .refine((e) => e.EMAIL_PROVIDER !== 'resend' || !!e.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    path: ['RESEND_API_KEY'],
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
