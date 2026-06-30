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
  port: Number(optional('PORT', '8080')),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),

  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  smtpHost: optional('SMTP_HOST'),
  smtpPort: Number(optional('SMTP_PORT', '587')),
  smtpUser: optional('SMTP_USER'),
  smtpPass: optional('SMTP_PASS'),
  smtpFrom: optional('SMTP_FROM'),

  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;
