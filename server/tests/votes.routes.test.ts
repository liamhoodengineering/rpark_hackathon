import assert from 'node:assert/strict';
import test, { afterEach, before } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Express } from 'express';
import type { Pin } from '../src/types/index.js';
import type { VoteTally } from '../src/service/VoteService.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '8080';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

let app: Express;
let PinService: typeof import('../src/service/PinService.js').PinService;
let VoteService: typeof import('../src/service/VoteService.js').VoteService;

let originalPinGetById: typeof PinService.getById;
let originalVoteMethods: {
  getTally: typeof VoteService.getTally;
  getUserVote: typeof VoteService.getUserVote;
  createVote: typeof VoteService.createVote;
  updateVote: typeof VoteService.updateVote;
  deleteVote: typeof VoteService.deleteVote;
  syncPinVoteState: typeof VoteService.syncPinVoteState;
  syncReporterCredibility: typeof VoteService.syncReporterCredibility;
};

const basePin: Pin = {
  id: '11111111-1111-1111-1111-111111111111',
  reporter_id: 'user-1',
  lat: 33.7756,
  lng: -84.3963,
  name: 'Crosswalk blocked',
  description: 'Construction cones block the crossing.',
  severity: 'Medium',
  radius_m: 120,
  upvotes: 2,
  downvotes: 0,
  status: 'active',
  expires_at: null,
  created_at: '2026-06-30T12:00:00.000Z',
};

function makeAuthToken(userId = 'user-2'): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@example.com` },
    process.env.JWT_SECRET as string,
  );
}

before(async () => {
  const [{ createApp }, pinServiceModule, voteServiceModule] = await Promise.all([
    import('../src/app.js'),
    import('../src/service/PinService.js'),
    import('../src/service/VoteService.js'),
  ]);

  app = createApp();
  PinService = pinServiceModule.PinService;
  VoteService = voteServiceModule.VoteService;

  originalPinGetById = PinService.getById;
  originalVoteMethods = {
    getTally: VoteService.getTally,
    getUserVote: VoteService.getUserVote,
    createVote: VoteService.createVote,
    updateVote: VoteService.updateVote,
    deleteVote: VoteService.deleteVote,
    syncPinVoteState: VoteService.syncPinVoteState,
    syncReporterCredibility: VoteService.syncReporterCredibility,
  };
});

afterEach(() => {
  PinService.getById = originalPinGetById;
  VoteService.getTally = originalVoteMethods.getTally;
  VoteService.getUserVote = originalVoteMethods.getUserVote;
  VoteService.createVote = originalVoteMethods.createVote;
  VoteService.updateVote = originalVoteMethods.updateVote;
  VoteService.deleteVote = originalVoteMethods.deleteVote;
  VoteService.syncPinVoteState = originalVoteMethods.syncPinVoteState;
  VoteService.syncReporterCredibility = originalVoteMethods.syncReporterCredibility;
});

test('GET /pins/:id/votes returns tally', async () => {
  const tally: VoteTally = { up: 3, down: 1, total: 4 };

  PinService.getById = async (id) => {
    assert.equal(id, basePin.id);
    return basePin;
  };
  VoteService.getTally = async (id) => {
    assert.equal(id, basePin.id);
    return tally;
  };

  const res = await request(app).get(`/pins/${basePin.id}/votes`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, tally);
});

test('POST /pins/:id/vote requires auth', async () => {
  const res = await request(app).post(`/pins/${basePin.id}/vote`).send({
    vote_type: 'up',
    lat: basePin.lat,
    lng: basePin.lng,
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Authentication required');
});

test('POST /pins/:id/vote records a new vote inside radius', async () => {
  const tally: VoteTally = { up: 4, down: 1, total: 5 };

  PinService.getById = async () => basePin;
  VoteService.getUserVote = async () => null;

  let created = false;
  VoteService.createVote = async (input) => {
    created = true;
    assert.equal(input.pinId, basePin.id);
    assert.equal(input.userId, 'user-2');
    assert.equal(input.voteType, 'up');
  };

  VoteService.getTally = async () => tally;
  VoteService.syncPinVoteState = async (pinId, nextTally) => {
    assert.equal(pinId, basePin.id);
    assert.deepEqual(nextTally, tally);
    return 'active';
  };

  let credibilitySynced = false;
  VoteService.syncReporterCredibility = async (reporterId) => {
    credibilitySynced = true;
    assert.equal(reporterId, 'user-1');
  };

  const res = await request(app)
    .post(`/pins/${basePin.id}/vote`)
    .set('Authorization', `Bearer ${makeAuthToken('user-2')}`)
    .send({
      vote_type: 'up',
      lat: basePin.lat,
      lng: basePin.lng,
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Vote recorded');
  assert.equal(res.body.status, 'active');
  assert.deepEqual(res.body.tally, tally);
  assert.equal(created, true);
  assert.equal(credibilitySynced, true);
});

test('DELETE /pins/:id/vote removes the caller vote', async () => {
  const tally: VoteTally = { up: 1, down: 0, total: 1 };

  PinService.getById = async () => basePin;
  VoteService.getUserVote = async () => ({ id: 'vote-1', vote_type: 'up' });

  let deletedId = '';
  VoteService.deleteVote = async (voteId) => {
    deletedId = voteId;
  };

  VoteService.getTally = async () => tally;
  VoteService.syncPinVoteState = async () => 'active';
  VoteService.syncReporterCredibility = async () => undefined;

  const res = await request(app)
    .delete(`/pins/${basePin.id}/vote`)
    .set('Authorization', `Bearer ${makeAuthToken('user-2')}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Vote removed');
  assert.deepEqual(res.body.tally, tally);
  assert.equal(deletedId, 'vote-1');
});

test('DELETE /pins/:id/vote requires auth', async () => {
  const res = await request(app).delete(`/pins/${basePin.id}/vote`);

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Authentication required');
});

test('POST /pins/:id/vote rejects caller outside pin radius', async () => {
  PinService.getById = async () => ({ ...basePin, radius_m: 30 });

  const res = await request(app)
    .post(`/pins/${basePin.id}/vote`)
    .set('Authorization', `Bearer ${makeAuthToken('user-2')}`)
    .send({
      vote_type: 'down',
      lat: 33.79,
      lng: -84.37,
    });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'You must be within the pin radius to vote');
});
