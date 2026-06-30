/**
 * Typed fetch wrapper for the PinPoint API.
 * Attaches the JWT (when present) and centralizes base URL + error handling.
 * Extend with pins/votes/auth/watch-area calls as endpoints land.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
const TOKEN_KEY = 'pinpoint_jwt';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  // TODO: auth.register/login/me, pins.list/create/delete,
  //       votes.tally/cast, watchAreas.list/create/delete
};
