import { request } from './client.js';
import type { Pin, Severity } from '../types/domain.js';

export interface ListPinsParams {
  lat: number;
  lng: number;
  /** Search radius in meters around (lat, lng). */
  radius: number;
}

export interface CreatePinBody {
  lat: number;
  lng: number;
  name?: string;
  description?: string;
  severity: Severity;
  radius_m: number;
}

export const pinsApi = {
  /** Active, non-expired pins near a point (server runs bounding-box + Haversine). */
  list: ({ lat, lng, radius }: ListPinsParams) =>
    request<Pin[]>(
      `/pins?lat=${lat}&lng=${lng}&radius=${Math.round(radius)}`,
    ),

  /** Create a pin. Works logged-out (anonymous) or with a JWT (persistent). */
  create: (body: CreatePinBody) =>
    request<Pin>('/pins', { method: 'POST', body: JSON.stringify(body) }),

  /** Owner-only delete (account pins). */
  remove: (id: string) =>
    request<void>(`/pins/${id}`, { method: 'DELETE' }),
};
