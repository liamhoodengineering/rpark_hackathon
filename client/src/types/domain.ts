export type Severity = 'Low' | 'Medium' | 'High';
export type PinStatus = 'active' | 'removed';
export type VoteType = 'up' | 'down';

export interface User {
  id: string;
  email: string;
  display_name: string;
  upvotes_received: number;
  downvotes_received: number;
  created_at: string;
}

export type PublicUser = User & { credibility_score: number };

export interface Pin {
  id: string;
  reporter_id: string | null;
  lng: number;
  lat: number;
  name: string | null;
  description: string | null;
  severity: Severity;
  radius_m: number;
  upvotes: number;
  downvotes: number;
  status: PinStatus;
  expires_at: string | null;
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

export interface VoteTally {
  up: number;
  down: number;
  total: number;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}
