import { getToken, request } from './client.js';
import type { Pin, Severity } from '../types/domain.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export interface CreatePinPayload {
  lat: number;
  lng: number;
  severity: Severity;
  radius_m: number;
  name?: string;
  description?: string;
}

export const pinsApi = {
  list: (lat: number, lng: number, radius: number) =>
    request<Pin[]>(`/pins?lat=${lat}&lng=${lng}&radius=${radius}`),

  create: (payload: CreatePinPayload) =>
    request<Pin>('/pins', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadPhoto: async (pinId: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append('photo', file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // No Content-Type header — browser sets multipart boundary automatically
    await fetch(`${BASE_URL}/pins/${pinId}/photo`, {
      method: 'POST',
      headers,
      body: formData,
    });
  },
};
