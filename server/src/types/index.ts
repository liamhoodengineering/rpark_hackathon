/**
 * Shared domain types for the PinPoint API.
 * Mirror the database schema in `server/db/schema.sql`.
 */

export type Severity = 'Low' | 'Medium' | 'High';
export type PinStatus = 'active' | 'removed';
export type VoteType = 'up' | 'down';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  display_name: string;
  upvotes_received: number;
  downvotes_received: number;
  created_at: string;
}

/** Public-safe user shape (never expose password_hash). */
export type PublicUser = Omit<User, never> & { credibility_score: number };

export interface Pin {
  id: string;
  reporter_id: string | null; // null = anonymous report
  lng: number;
  lat: number;
  name: string | null;
  description: string | null;
  severity: Severity;
  radius_m: number;
  upvotes: number;
  downvotes: number;
  status: PinStatus;
  expires_at: string | null; // anonymous: created_at + 1h; account: null
  created_at: string;
}

export interface Vote {
  id: string;
  pin_id: string;
  user_id: string;
  vote_type: VoteType;
  created_at: string;
}

export interface WatchArea {
  id: string;
  user_id: string;
  lng: number;
  lat: number;
  radius_m: number;
  min_severity: Severity;
  email_enabled: boolean;
  created_at: string;
}

/** Decoded JWT payload attached to authenticated requests. */
export interface AuthPayload {
  sub: string; // user id
  email: string;
}

const SEVERITY_RANK: Record<Severity, number> = { Low: 1, Medium: 2, High: 3 };

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}
