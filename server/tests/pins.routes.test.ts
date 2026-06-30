import assert from 'node:assert/strict';
import test, { afterEach, before } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Express } from 'express';
import type { Pin } from '../src/types/index.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '8080';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

let app: Express;
let PinService: typeof import('../src/service/PinService.js').PinService;
let originalMethods: {
  listAll: typeof PinService.listAll;
  listNearby: typeof PinService.listNearby;
  getById: typeof PinService.getById;
  create: typeof PinService.create;
  update: typeof PinService.update;
  delete: typeof PinService.delete;
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

function makeAuthToken(userId = 'user-1'): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@example.com` },
    process.env.JWT_SECRET as string,
  );
}

before(async () => {
  const [{ createApp }, pinServiceModule] = await Promise.all([
    import('../src/app.js'),
    import('../src/service/PinService.js'),
  ]);

  app = createApp();
  PinService = pinServiceModule.PinService;
  originalMethods = {
    listAll: PinService.listAll,
    listNearby: PinService.listNearby,
    getById: PinService.getById,
    create: PinService.create,
    update: PinService.update,
    delete: PinService.delete,
  };
});

afterEach(() => {
  PinService.listAll = originalMethods.listAll;
  PinService.listNearby = originalMethods.listNearby;
  PinService.getById = originalMethods.getById;
  PinService.create = originalMethods.create;
  PinService.update = originalMethods.update;
  PinService.delete = originalMethods.delete;
});

test('GET /pins returns nearby pins', async () => {
  PinService.listNearby = async (input) => {
    assert.deepEqual(input, { lat: 33.7, lng: -84.3, radius: 500 });
    return [basePin];
  };

  const res = await request(app)
    .get('/pins')
    .query({ lat: '33.7', lng: '-84.3', radius: '500' });

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, basePin.id);
});

test('GET /pins/:id returns a single pin', async () => {
  PinService.getById = async (id) => {
    assert.equal(id, basePin.id);
    return basePin;
  };

  const res = await request(app).get(`/pins/${basePin.id}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.id, basePin.id);
});

test('POST /pins creates an anonymous pin with expiry', async () => {
  PinService.listNearby = async (input) => {
    assert.equal(input.radius, 25);
    return [];
  };

  PinService.create = async (input) => {
    assert.equal(input.reporter_id, null);
    assert.equal(input.name, null);
    assert.ok(input.expires_at);
    return {
      ...basePin,
      id: '22222222-2222-2222-2222-222222222222',
      reporter_id: null,
      expires_at: input.expires_at,
    };
  };

  const res = await request(app)
    .post('/pins')
    .send({
      lat: 33.7756,
      lng: -84.3963,
      name: '   ',
      description: 'Fresh hazard',
      severity: 'High',
      radius_m: 150,
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.reporter_id, null);
  assert.ok(res.body.expires_at);
});

test('POST /pins rejects creating a duplicate pin that is too close', async () => {
  PinService.listNearby = async (input) => {
    assert.deepEqual(input, { lat: 33.7756, lng: -84.3963, radius: 25 });
    return [basePin];
  };

  PinService.create = async () => {
    assert.fail('create should not be called when a nearby duplicate pin exists');
  };

  const res = await request(app)
    .post('/pins')
    .send({
      lat: 33.7756,
      lng: -84.3963,
      name: 'Crosswalk blocked duplicate',
      description: 'Same hazard',
      severity: 'Medium',
      radius_m: 120,
    });

  assert.equal(res.status, 409);
  assert.equal(
    res.body.error,
    'A pin already exists nearby. Please interact with the existing pin instead of creating a duplicate.',
  );
});

test('PUT /pins/:id updates an owner pin', async () => {
  PinService.getById = async () => basePin;
  PinService.update = async (id, input) => {
    assert.equal(id, basePin.id);
    assert.equal(input.status, 'removed');
    return { ...basePin, ...input };
  };

  const res = await request(app)
    .put(`/pins/${basePin.id}`)
    .set('Authorization', `Bearer ${makeAuthToken()}`)
    .send({
      lat: 33.78,
      lng: -84.39,
      name: 'Updated name',
      description: 'Updated description',
      severity: 'Low',
      radius_m: 80,
      status: 'removed',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Updated name');
  assert.equal(res.body.status, 'removed');
});

test('DELETE /pins/:id removes an owner pin', async () => {
  PinService.getById = async () => basePin;
  PinService.delete = async (id) => {
    assert.equal(id, basePin.id);
    return true;
  };

  const res = await request(app)
    .delete(`/pins/${basePin.id}`)
    .set('Authorization', `Bearer ${makeAuthToken()}`);

  assert.equal(res.status, 204);
});

test('PUT /pins/:id rejects non-owners', async () => {
  PinService.getById = async () => basePin;

  const res = await request(app)
    .put(`/pins/${basePin.id}`)
    .set('Authorization', `Bearer ${makeAuthToken('user-2')}`)
    .send({
      lat: 33.78,
      lng: -84.39,
      name: 'Updated name',
      description: 'Updated description',
      severity: 'Low',
      radius_m: 80,
    });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'You can only update your own account pins');
});