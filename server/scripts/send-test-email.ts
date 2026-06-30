import 'dotenv/config';
import { sendEmail } from '../src/notifications/index.js';

/**
 * Manual test for the email notification system.
 *
 * Usage:
 *   npm run email:test --workspace server -- you@example.com
 *   # or set TEST_EMAIL in the environment and omit the arg
 *
 * Notes:
 * - Requires SMTP_HOST, SMTP_USER, SMTP_PASS in server/.env.
 * - Works with any SMTP provider (Gmail, Brevo, SendGrid, ...) and can
 *   send to any recipient — no domain verification needed.
 */
async function main() {
  const to = process.argv[2] ?? process.env.TEST_EMAIL;

  if (!to) {
    console.error(
      'No recipient provided. Pass one as an argument or set TEST_EMAIL.\n' +
        '  npm run email:test --workspace server -- you@example.com',
    );
    process.exit(1);
  }

  console.log(`Sending test email to ${to} ...`);

  const messageId = await sendEmail(
    to,
    'This is a PinPoint test email. If you received it, the email system works.',
    { subject: 'PinPoint — test email' },
  );

  console.log('Sent. Message id:', messageId);
}

main().catch((err) => {
  console.error('Failed to send test email:');
  console.error(err);
  process.exit(1);
});
