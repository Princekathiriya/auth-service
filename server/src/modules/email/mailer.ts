import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Code depends on this interface, not on a provider. Swapping Resend for SES,
// or for a fake in tests, touches nothing else.
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send({ to, subject, text }: EmailMessage) {
    logger.info({ to, subject }, `Email (not really sent):\n${text}`);
  }
}

class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  async send({ to, subject, text, html }: EmailMessage) {
    // Resend is a plain HTTPS API, so built-in fetch is enough: no SDK dependency.
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text, html }),
      signal: AbortSignal.timeout(10_000), // never hang forever on a slow provider
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
}

let mailer: Mailer = env.EMAIL_PROVIDER === 'resend' ? new ResendMailer(env.RESEND_API_KEY!) : new ConsoleMailer();

/** Tests swap in a fake mailer that records messages. */
export function setMailer(m: Mailer) {
  mailer = m;
}

/**
 * Send without making the HTTP request wait for it, and never crash on failure.
 * Not waiting also stops attackers timing /forgot-password to learn which emails exist.
 * Limitation: if sending fails, the email is lost (only logged). Project 6 replaces
 * this with a BullMQ job queue that retries.
 */
export function sendInBackground(message: EmailMessage) {
  mailer.send(message).catch((err: unknown) => {
    logger.error({ err, to: message.to, subject: message.subject }, 'Failed to send email');
  });
}
