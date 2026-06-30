import { request } from './client.js';
import type { Pin, Severity } from '../types/domain.js';

export interface ListPinsParams {
  lat: number;
  lng: number;
  radius: number;
}

export interface CreatePinBody {
  lat: number;
  lng: number;
  name?: string | null;
  description?: string | null;
  severity: Severity;
  radius_m: number;
}

export const pinsApi = {
  list: ({ lat, lng, radius }: ListPinsParams) =>
    request<Pin[]>(`/pins?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(Math.round(radius))}`),

  create: (body: CreatePinBody) =>
    request<Pin>('/pins', { method: 'POST', body: JSON.stringify(body) }),

  delete: (id: string) => request<void>(`/pins/${id}`, { method: 'DELETE' }),
  remove: (id: string) =>
    request<void>(`/pins/${id}`, { method: 'DELETE' }),
};
