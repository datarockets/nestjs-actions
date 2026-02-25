import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { router } from '../router';
import {
  ShowAction,
  UpdateAction,
  createTestApp,
  messages,
  threads,
} from '../tests/fixtures/router.fixtures';

describe('runtime/create-controller', () => {
  describe('resources with explicit modules', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const result = router.create([
        router.resources('threads', { to: threads }, [
          router.resources('messages', { to: messages }),
        ]),
      ]);
      app = await createTestApp(result.controllers());
    });

    afterAll(() => app.close());

    it('GET /threads', () => {
      return request(app.getHttpServer())
        .get('/threads')
        .expect(200)
        .expect({ items: [] });
    });

    it('POST /threads', () => {
      return request(app.getHttpServer())
        .post('/threads')
        .expect(201)
        .expect({ id: '1' });
    });

    it('GET /threads/:id', () => {
      return request(app.getHttpServer())
        .get('/threads/42')
        .expect(200)
        .expect({ id: '42' });
    });

    it('PATCH /threads/:id requires authorization', () => {
      return request(app.getHttpServer()).patch('/threads/42').expect(401);
    });

    it('PATCH /threads/:id with authorization', () => {
      return request(app.getHttpServer())
        .patch('/threads/42')
        .set('authorization', 'Bearer token')
        .expect(200)
        .expect({ updated: true });
    });

    it('GET /threads/:thread_id/messages', () => {
      return request(app.getHttpServer())
        .get('/threads/1/messages')
        .expect(200)
        .expect({ messages: [], threadId: '1' });
    });

    it('POST /threads/:thread_id/messages', () => {
      return request(app.getHttpServer())
        .post('/threads/1/messages')
        .expect(201)
        .expect({ id: 'm1' });
    });
  });

  describe('resources with auto-traversal', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const actions = { threads: { ...threads, messages } };
      const result = router.create(
        [router.resources('threads', [router.resources('messages')])],
        actions,
      );
      app = await createTestApp(result.controllers());
    });

    afterAll(() => app.close());

    it('GET /threads', () => {
      return request(app.getHttpServer())
        .get('/threads')
        .expect(200)
        .expect({ items: [] });
    });

    it('POST /threads/:thread_id/messages', () => {
      return request(app.getHttpServer())
        .post('/threads/1/messages')
        .expect(201)
        .expect({ id: 'm1' });
    });
  });

  describe('resources with custom param', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const result = router.create([
        router.resources('workspaces', { to: threads, param: 'slug' }, [
          router.resources('messages', { to: messages }),
        ]),
      ]);
      app = await createTestApp(result.controllers());
    });

    afterAll(() => app.close());

    it('GET /workspaces/:workspaceSlug/messages includes workspaceSlug param', () => {
      return request(app.getHttpServer())
        .get('/workspaces/my-workspace/messages')
        .expect(200)
        .expect((res) => {
          expect(res.body.workspaceSlug).toBe('my-workspace');
        });
    });
  });

  describe('path routes', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const settings = { ShowAction };
      const billing = { UpdateAction };

      const result = router.create([
        router.path('settings', { to: settings }, [
          router.path('billing', { to: billing }),
        ]),
      ]);
      app = await createTestApp(result.controllers());
    });

    afterAll(() => app.close());

    it('GET /settings/:id', () => {
      return request(app.getHttpServer())
        .get('/settings/1')
        .expect(200)
        .expect({ id: '1' });
    });

    it('PATCH /settings/billing/:id requires authorization', () => {
      return request(app.getHttpServer())
        .patch('/settings/billing/1')
        .expect(401);
    });

    it('PATCH /settings/billing/:id with authorization', () => {
      return request(app.getHttpServer())
        .patch('/settings/billing/1')
        .set('authorization', 'Bearer token')
        .expect(200)
        .expect({ updated: true });
    });

    it('does not add id param to path children (unlike resources)', () => {
      return request(app.getHttpServer())
        .patch('/settings/:setting_id/billing/1')
        .expect(404);
    });
  });

  describe('path routes with auto-traversal', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const actions = {
        settings: { ShowAction, billing: { UpdateAction } },
      };

      const result = router.create(
        [router.path('settings', [router.path('billing')])],
        actions,
      );
      app = await createTestApp(result.controllers());
    });

    afterAll(() => app.close());

    it('GET /settings/:id', () => {
      return request(app.getHttpServer())
        .get('/settings/1')
        .expect(200)
        .expect({ id: '1' });
    });

    it('PATCH /settings/billing/:id with authorization', () => {
      return request(app.getHttpServer())
        .patch('/settings/billing/1')
        .set('authorization', 'Bearer token')
        .expect(200)
        .expect({ updated: true });
    });
  });
});
