import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import nodemailer, { type Transporter } from 'nodemailer';

// SMTP env must be present before the email module builds its transporter.
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'pinpoint@example.test';
process.env.SMTP_PASS = 'app-password';
process.env.SMTP_FROM = 'PinPoint <pinpoint@example.test>';

interface SentMail {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
}

const TEST_MESSAGE_ID = '<test-id@example.test>';

// Fake transporter so no real email is ever sent.
const sendMailMock = mock.fn(async (_options: SentMail) => ({
  messageId: TEST_MESSAGE_ID,
}));
const fakeTransporter = { sendMail: sendMailMock } as unknown as Transporter;

let sendEmail: typeof import('../src/notifications/email.js').sendEmail;

before(async () => {
  mock.method(nodemailer, 'createTransport', () => fakeTransporter);
  ({ sendEmail } = await import('../src/notifications/email.js'));
});

beforeEach(() => {
  sendMailMock.mock.resetCalls();
});

function lastSentMail(): SentMail {
  const call = sendMailMock.mock.calls.at(-1);
  assert.ok(call, 'expected sendMail to have been called');
  return call.arguments[0];
}

test('sendEmail delivers a plain-text message to the recipient', async () => {
  const id = await sendEmail('user@example.com', 'Hello from PinPoint', {
    subject: 'PinPoint — test email',
  });

  assert.equal(id, TEST_MESSAGE_ID);
  assert.equal(sendMailMock.mock.callCount(), 1);

  const mail = lastSentMail();
  assert.equal(mail.to, 'user@example.com');
  assert.equal(mail.subject, 'PinPoint — test email');
  assert.equal(mail.text, 'Hello from PinPoint');
  assert.equal(mail.from, 'PinPoint <pinpoint@example.test>');
});

test('sendEmail falls back to a default subject', async () => {
  await sendEmail('user@example.com', 'Body');
  assert.equal(lastSentMail().subject, 'PinPoint Notification');
});

test('sendEmail includes an HTML body when provided', async () => {
  await sendEmail('user@example.com', 'plain text', {
    html: '<p>rich</p>',
  });

  const mail = lastSentMail();
  assert.equal(mail.text, 'plain text');
  assert.equal(mail.html, '<p>rich</p>');
});

test('sendEmail rejects a missing recipient', async () => {
  await assert.rejects(
    () => sendEmail('', 'body'),
    /recipient email is required/,
  );
  assert.equal(sendMailMock.mock.callCount(), 0);
});

test('sendEmail rejects when both message and html are empty', async () => {
  await assert.rejects(
    () => sendEmail('user@example.com', ''),
    /message is required/,
  );
  assert.equal(sendMailMock.mock.callCount(), 0);
});
