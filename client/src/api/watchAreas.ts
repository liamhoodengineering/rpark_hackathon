import { request } from './client.js';
import type { WatchArea, Severity } from '../types/domain.js';

export interface CreateWatchAreaBody {
  lat: number;
  lng: number;
  radius_m: number;
  min_severity: Severity;
  email_enabled: boolean;
}

export const watchAreasApi = {
  list: () => request<WatchArea[]>('/watch-areas'),
  create: (body: CreateWatchAreaBody) =>
    request<WatchArea>('/watch-areas', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/watch-areas/${id}`, { method: 'DELETE' }),
};
