import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Pin } from '../src/types/index.js';

// SMTP env so the email module can build its (mocked) transporter.
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'pinpoint@example.test';
process.env.SMTP_PASS = 'app-password';
process.env.SMTP_FROM = 'PinPoint <pinpoint@example.test>';

interface SentMail {
  to?: string;
  subject?: string;
  text?: string;
}

const sentMail: SentMail[] = [];
const sendMailMock = mock.fn(async (options: SentMail) => {
  sentMail.push(options);
  return { messageId: '<test-id@example.test>' };
});
const fakeTransporter = { sendMail: sendMailMock } as unknown as Transporter;

let AlertService: typeof import('../src/service/AlertService.js').AlertService;
let UserService: typeof import('../src/service/UserService.js').UserService;

const basePin: Pin = {
  id: '11111111-1111-1111-1111-111111111111',
  reporter_id: 'reporter-1',
  lat: 33.7756,
  lng: -84.3963,
  name: 'Black ice on sidewalk',
  description: 'Slippery patch near the entrance.',
  severity: 'High',
  radius_m: 500,
  upvotes: 0,
  downvotes: 0,
  status: 'active',
  expires_at: null,
  created_at: '2026-06-30T12:00:00.000Z',
};

before(async () => {
  mock.method(nodemailer, 'createTransport', () => fakeTransporter);
  ({ AlertService } = await import('../src/service/AlertService.js'));
  ({ UserService } = await import('../src/service/UserService.js'));
});

beforeEach(() => {
  sentMail.length = 0;
  sendMailMock.mock.resetCalls();
});

test('notifyNearbyUsers emails each nearby user with hazard details', async () => {
  mock.method(UserService, 'findWithinRadius', async () => [
    {
      id: 'u1',
      email: 'a@example.com',
      display_name: 'A',
      lat: 33.7,
      lng: -84.3,
    },
    {
      id: 'u2',
      email: 'b@example.com',
      display_name: 'B',
      lat: 33.7,
      lng: -84.3,
    },
  ]);

  const sent = await AlertService.notifyNearbyUsers(basePin);

  assert.equal(sent, 2);
  assert.equal(sendMailMock.mock.callCount(), 2);

  const mail = sentMail[0];
  assert.equal(mail.to, 'a@example.com');
  assert.match(mail.subject ?? '', /High hazard nearby/);
  assert.match(mail.text ?? '', /Black ice on sidewalk/);
  assert.match(mail.text ?? '', /Severity: High/);
  assert.match(mail.text ?? '', /Slippery patch near the entrance\./);
});

test('notifyNearbyUsers passes the reporter id so the reporter is excluded', async () => {
  const findMock = mock.method(UserService, 'findWithinRadius', async () => []);

  await AlertService.notifyNearbyUsers(basePin);

  const [lat, lng, radius, exclude] = findMock.mock.calls[0].arguments;
  assert.equal(lat, basePin.lat);
  assert.equal(lng, basePin.lng);
  assert.equal(radius, basePin.radius_m);
  assert.equal(exclude, 'reporter-1');
  assert.equal(sendMailMock.mock.callCount(), 0);
});

test('notifyNearbyUsers swallows lookup errors and sends nothing', async () => {
  mock.method(UserService, 'findWithinRadius', async () => {
    throw new Error('db unavailable');
  });

  const sent = await AlertService.notifyNearbyUsers(basePin);

  assert.equal(sent, 0);
  assert.equal(sendMailMock.mock.callCount(), 0);
});
