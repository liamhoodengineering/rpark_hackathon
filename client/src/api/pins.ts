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
  expires_in_hours?: number;
}

export const pinsApi = {
  list: (params?: ListPinsParams) =>
    params
      ? request<Pin[]>(`/pins?lat=${encodeURIComponent(params.lat)}&lng=${encodeURIComponent(params.lng)}&radius=${encodeURIComponent(Math.round(params.radius))}`)
      : request<Pin[]>('/pins'),

  create: (body: CreatePinBody) =>
    request<Pin>('/pins', { method: 'POST', body: JSON.stringify(body) }),

  delete: (id: string) => request<void>(`/pins/${id}`, { method: 'DELETE' }),
  remove: (id: string) =>
    request<void>(`/pins/${id}`, { method: 'DELETE' }),
};
