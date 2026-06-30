import { request } from './client.js';
import type { AuthResponse, PublicUser } from '../types/domain.js';

export const authApi = {
  register: (email: string, password: string, display_name: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<PublicUser>('/auth/me'),
  setLocation: (lat: number, lng: number) =>
    request<PublicUser>('/auth/me/location', {
      method: 'PUT',
      body: JSON.stringify({ lat, lng }),
    }),
  setTracking: (enabled: boolean) =>
    request<PublicUser>('/auth/me/alerts', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
};
