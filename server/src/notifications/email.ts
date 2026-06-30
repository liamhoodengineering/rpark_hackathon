import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Email notifications over SMTP via Nodemailer.
 *
 * Works with any SMTP provider and can send to ANY recipient (no domain
 * verification required, unlike the Resend/Mailgun sandbox).
 *
 * Required env vars:
 *   SMTP_HOST - e.g. "smtp.gmail.com"
 *   SMTP_USER - SMTP username (for Gmail, your full address)
 *   SMTP_PASS - SMTP password (for Gmail, a 16-char App Password)
 * Optional:
 *   SMTP_PORT - default 587 (use 465 for implicit TLS)
 *   SMTP_FROM - "From" address; defaults to SMTP_USER
 *
 * Gmail setup: enable 2-Step Verification, then create an App Password
 * (Google Account -> Security -> App passwords) and use it as SMTP_PASS.
 */

export interface SendEmailOptions {
  /** Email subject line. */
  subject?: string;
  /** Optional HTML body (falls back to `message` as plain text). */
  html?: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error(
        'sendEmail: SMTP_HOST, SMTP_USER, and SMTP_PASS must all be set',
      );
    }

    const port = Number(process.env.SMTP_PORT ?? '587');

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // implicit TLS on 465, STARTTLS otherwise
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Send an email notification to a single recipient.
 *
 * @param email   - recipient email address
 * @param message - plain-text message body
 * @param options - optional subject and HTML body
 * @returns the SMTP message id
 */
export async function sendEmail(
  email: string,
  message: string,
  options: SendEmailOptions = {},
): Promise<string> {
  if (!email) {
    throw new Error('sendEmail: recipient email is required');
  }
  if (!message && !options.html) {
    throw new Error('sendEmail: message is required');
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const subject = options.subject ?? 'PinPoint Notification';

  const info = await getTransporter().sendMail({
    from,
    to: email,
    subject,
    text: message,
    ...(options.html ? { html: options.html } : {}),
  });

  return info.messageId;
}
