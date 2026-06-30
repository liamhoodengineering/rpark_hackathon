import { request } from './client.js';
import type { VoteTally, VoteType } from '../types/domain.js';

export const votesApi = {
  cast: (pinId: string, voteType: VoteType, lat: number, lng: number) =>
    request<{ message: string }>(`/pins/${pinId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote_type: voteType, lat, lng }),
    }),
  cancel: (pinId: string) =>
    request<{ message: string }>(`/pins/${pinId}/vote`, { method: 'DELETE' }),
  getTally: (pinId: string) => request<VoteTally>(`/pins/${pinId}/votes`),
};
