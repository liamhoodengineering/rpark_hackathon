import 'dotenv/config';

/**
 * Centralized, validated access to environment variables.
 * Import `env` instead of reading `process.env` directly elsewhere.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '4000')),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),

  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  resendApiKey: optional('RESEND_API_KEY'),
  alertsFromEmail: optional(
    'ALERTS_FROM_EMAIL',
    'PinPoint <onboarding@resend.dev>',
  ),

  twilioAccountSid: optional('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: optional('TWILIO_AUTH_TOKEN'),
  twilioFromNumber: optional('TWILIO_FROM_NUMBER'),

  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;
