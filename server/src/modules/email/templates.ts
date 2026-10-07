import { env } from '../../config/env.js';
import type { EmailMessage } from './mailer.js';

// User-controlled values (like the name) MUST be escaped before going into HTML.
// Otherwise a user named `<a href="https://evil.example">Click here</a>` puts a
// phishing link inside an email that really comes from us.
export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Links point at the FRONTEND, which then POSTs the token to the API.
// Why not a GET link straight to the API? Email security scanners (Outlook Safe
// Links etc.) open every link in an email automatically. A GET that consumes the
// token would be "used up" by the scanner before the user ever clicks.
const link = (path: string, token: string) => `${env.CLIENT_ORIGIN}${path}?token=${encodeURIComponent(token)}`;

export function verifyEmailMessage(to: string, name: string, token: string): EmailMessage {
  const url = link('/verify-email', token);
  return {
    to,
    subject: 'Verify your email',
    text: `Hi ${name},\n\nConfirm your email address by opening this link (valid for 24 hours):\n${url}\n\nIf you didn't sign up, ignore this email.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address (link valid for 24 hours):</p><p><a href="${escapeHtml(url)}">Verify email</a></p><p>If you didn't sign up, ignore this email.</p>`,
  };
}

export function resetPasswordMessage(to: string, name: string, token: string): EmailMessage {
  const url = link('/reset-password', token);
  return {
    to,
    subject: 'Reset your password',
    text: `Hi ${name},\n\nReset your password with this link (valid for 30 minutes, single use):\n${url}\n\nIf you didn't ask for this, ignore this email. Your password won't change.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Reset your password (link valid for 30 minutes, single use):</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you didn't ask for this, ignore this email. Your password won't change.</p>`,
  };
}
