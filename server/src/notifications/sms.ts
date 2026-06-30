import twilio, { type Twilio } from 'twilio';

/** The Twilio message resource returned by `messages.create`. */
type TwilioMessage = Awaited<ReturnType<Twilio['messages']['create']>>;

/**
 * SMS notifications via Twilio (https://twilio.com).
 * Free trial: ~$15 credit (≈1,900 SMS). On a trial account you can only send
 * to phone numbers you have verified in the Twilio console, and messages are
 * prefixed with a trial notice.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID  - from the Twilio console dashboard
 *   TWILIO_AUTH_TOKEN   - from the Twilio console dashboard
 *   TWILIO_FROM_NUMBER  - your Twilio phone number in E.164 format, e.g. "+15551234567"
 */

let twilioClient: Twilio | undefined;

function getClient(): Twilio {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error(
        'sendSms: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables must be set',
      );
    }
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * Send an SMS notification to a single phone number.
 *
 * @param phoneNumber - recipient phone number in E.164 format, e.g. "+15551234567"
 * @param message     - text message body
 * @returns the Twilio message resource
 */
export async function sendSms(
  phoneNumber: string,
  message: string,
): Promise<TwilioMessage> {
  if (!phoneNumber) {
    throw new Error('sendSms: phoneNumber is required');
  }
  if (!message) {
    throw new Error('sendSms: message is required');
  }

  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error(
      'sendSms: TWILIO_FROM_NUMBER environment variable is not set',
    );
  }

  return getClient().messages.create({
    body: message,
    from,
    to: phoneNumber,
  });
}
