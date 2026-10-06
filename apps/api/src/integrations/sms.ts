import { env } from "../lib/env";
import { fetchWithRetry, type FetchLike } from "../lib/http";

// Outbound SMS. Twilio when TWILIO_* is configured, otherwise a logging
// transport (dev/tests). Like email, SMS is not a secure channel: never put
// PHI in a text — templates only allow {userName}, {appId} and {status}.
export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface SmsSendResult {
  transport: "twilio" | "log";
  providerMessageId: string | null;
}

export interface SmsTransport {
  readonly name: "twilio" | "log";
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : "••••";
}

export class LogSmsTransport implements SmsTransport {
  readonly name = "log" as const;
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.sent.push(message);
    console.info(`[sms:log] to=${maskPhone(message.to)} body="${message.body}"`);
    return { transport: "log", providerMessageId: null };
  }
}

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  from: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export class TwilioSmsTransport implements SmsTransport {
  readonly name = "twilio" as const;

  constructor(private readonly opts: TwilioOptions) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.opts.accountSid)}/Messages.json`;
    const { response } = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.opts.accountSid}:${this.opts.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: message.to, From: this.opts.from, Body: message.body }).toString(),
      },
      // Two attempts at most: retrying a send risks a duplicate text.
      { maxAttempts: 2, timeoutMs: 8_000, baseDelayMs: 500, fetchImpl: this.opts.fetchImpl, sleep: this.opts.sleep },
    );
    const payload = (await response.json().catch(() => null)) as { sid?: string; message?: string } | null;
    if (!response.ok) {
      throw new Error(`Twilio responded ${response.status}: ${payload?.message ?? "unknown error"}`.slice(0, 300));
    }
    return { transport: "twilio", providerMessageId: payload?.sid ?? null };
  }
}

function createTransport(): SmsTransport {
  return env.twilio ? new TwilioSmsTransport(env.twilio) : new LogSmsTransport();
}

export const smsTransport: SmsTransport = createTransport();
