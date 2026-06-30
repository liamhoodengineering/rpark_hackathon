import { Resend, type CreateEmailResponseSuccess } from 'resend';

/**
 * Email notifications via Resend (https://resend.com).
 * Free tier: 3,000 emails/month (100/day).
 *
 * Required env vars:
 *   RESEND_API_KEY    - server-side API key from the Resend dashboard
 *   ALERTS_FROM_EMAIL - verified "from" address, e.g. "PinPoint <alerts@yourdomain.com>"
 *                       (during testing you can use "onboarding@resend.dev")
 */

export interface SendEmailOptions {
  /** Email subject line. */
  subject?: string;
  /** Optional HTML body (falls back to `message` as plain text). */
  html?: string;
}

let resendClient: Resend | undefined;

function getClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        'sendEmail: RESEND_API_KEY environment variable is not set',
      );
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Send an email notification to a single recipient.
 *
 * @param email   - recipient email address
 * @param message - plain-text message body
 * @param options - optional subject and HTML body
 * @returns the Resend response data
 */
export async function sendEmail(
  email: string,
  message: string,
  options: SendEmailOptions = {},
): Promise<CreateEmailResponseSuccess> {
  if (!email) {
    throw new Error('sendEmail: recipient email is required');
  }
  if (!message && !options.html) {
    throw new Error('sendEmail: message is required');
  }

  const from =
    process.env.ALERTS_FROM_EMAIL ?? 'PinPoint <onboarding@resend.dev>';
  const subject = options.subject ?? 'PinPoint Notification';

  const { data, error } = await getClient().emails.send({
    from,
    to: email,
    subject,
    text: message,
    ...(options.html ? { html: options.html } : {}),
  });

  if (error) {
    throw new Error(
      `sendEmail: Resend failed: ${error.message ?? JSON.stringify(error)}`,
    );
  }

  if (!data) {
    throw new Error('sendEmail: Resend returned no data');
  }

  return data;
}
