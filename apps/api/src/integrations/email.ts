import { env } from "../lib/env";
import { fetchWithRetry, type FetchLike } from "../lib/http";

// Outbound email. SendGrid when SENDGRID_API_KEY is set, otherwise a logging
// transport (dev/tests).
//
// Never put PHI (health info, SSN, plan details, rejection reasons, document
// contents) in an email: it isn't a secure channel. Say there's an update and
// link back to the portal — see emailTemplates.ts.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export class LogEmailTransport implements EmailTransport {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    console.info(`[email:log] to=${maskEmail(message.to)} subject="${message.subject}"`);
  }
}

export interface SendGridOptions {
  apiKey: string;
  from: string;
  fromName: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export class SendGridEmailTransport implements EmailTransport {
  static readonly ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

  constructor(private readonly opts: SendGridOptions) {}

  async send(message: EmailMessage): Promise<void> {
    const { response } = await fetchWithRetry(
      SendGridEmailTransport.ENDPOINT,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: this.opts.from, name: this.opts.fromName },
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
          // Link rewriting would route portal links through a tracker.
          tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
        }),
      },
      { maxAttempts: 3, timeoutMs: 5_000, baseDelayMs: 500, fetchImpl: this.opts.fetchImpl, sleep: this.opts.sleep },
    );
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`SendGrid responded ${response.status}: ${detail}`);
    }
  }
}

export function maskEmail(address: string): string {
  const [user, domain] = address.split("@");
  return domain ? `${user.slice(0, 1)}***@${domain}` : "***";
}

function createTransport(): EmailTransport {
  if (!env.sendgrid) return new LogEmailTransport();
  return new SendGridEmailTransport(env.sendgrid);
}

export const emailTransport: EmailTransport = createTransport();

// What the rest of the app calls. Email is a side effect: a failed send must
// never fail (or roll back) the action that triggered it, so errors are
// logged — without the recipient's full address — and reported as `false`.
export const email = {
  async send(message: EmailMessage): Promise<boolean> {
    try {
      await emailTransport.send(message);
      return true;
    } catch (err) {
      console.error(
        `Email "${message.subject}" to ${maskEmail(message.to)} failed:`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  },
};
