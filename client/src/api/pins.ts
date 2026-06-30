import { request } from './client.js';
import type { Pin, Severity } from '../types/domain.js';

export interface ListPinsQuery {
  lat: number;
  lng: number;
  radius: number;
}

export interface CreatePinBody {
  lat: number;
  lng: number;
  radius_m: number;
  severity: Severity;
  name?: string | null;
  description?: string | null;
}

export const pinsApi = {
  list: ({ lat, lng, radius }: ListPinsQuery) =>
    request<Pin[]>(`/pins?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`),
  create: (body: CreatePinBody) =>
    request<Pin>('/pins', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/pins/${id}`, { method: 'DELETE' }),
};