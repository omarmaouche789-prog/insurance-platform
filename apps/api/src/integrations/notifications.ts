// Adapter boundary for outbound email/SMS. SendGrid/Twilio land in the
// Phase 6 integrations layer; until then the mock just logs.
//
// Never put PHI (health info, SSN, document contents) in a notification body:
// email and SMS aren't secure channels. Link back to the portal instead.
export interface Notification {
  to: string;
  subject: string;
  body: string;
}

export interface NotificationAdapter {
  send(notification: Notification): Promise<void>;
}

export class MockNotificationAdapter implements NotificationAdapter {
  readonly sent: Notification[] = [];

  async send(notification: Notification): Promise<void> {
    this.sent.push(notification);
    console.info(`[mock email] to=${notification.to} subject="${notification.subject}"`);
  }
}

export const notifications: NotificationAdapter = new MockNotificationAdapter();
