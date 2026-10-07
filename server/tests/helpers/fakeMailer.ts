import type { EmailMessage, Mailer } from '../../src/modules/email/mailer.js';

// Records emails instead of sending them, so tests can read the links out.
class FakeMailer implements Mailer {
  sent: EmailMessage[] = [];
  failNext = false;

  async send(message: EmailMessage) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SMTP is down');
    }
    this.sent.push(message);
  }

  reset() {
    this.sent = [];
    this.failNext = false;
  }
}

export const fakeMailer = new FakeMailer();

/** Extract the ?token= value from the latest email sent to `to`. */
export function tokenFromLastEmail(to: string): string {
  const email = fakeMailer.sent.findLast((m) => m.to === to);
  if (!email) throw new Error(`No email sent to ${to}`);
  const match = email.text.match(/token=([\w%-]+)/);
  return decodeURIComponent(match![1]!);
}
