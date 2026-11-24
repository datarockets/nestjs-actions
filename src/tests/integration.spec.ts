import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { router } from '../index';
import {
  ShowAction,
  UpdateAction,
  createTestApp,
  messages,
  threads,
} from './fixtures/router.fixtures';

describe('actions integration', () => {
  describe('resources composition', () => {
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

    it('composes nested resources end-to-end', () => {
      return request(app.getHttpServer())
        .get('/threads/1/messages')
        .expect(200)
        .expect({ messages: [], threadId: '1' });
    });

    it('keeps before hook authorization behavior', () => {
      return request(app.getHttpServer()).patch('/threads/42').expect(401);
    });
  });

  describe('auto-traversal composition', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const actions = {
        threads: { ...threads, messages },
      };

      const result = router.create(
        [router.resources('threads', [router.resources('messages')])],
        actions,
      );
      app = await createTestApp(result.controllers());
    });

    afterAll(() => app.close());

    it('resolves modules through actions map', () => {
      return request(app.getHttpServer())
        .post('/threads/1/messages')
        .expect(201)
        .expect({ id: 'm1' });
    });
  });

  describe('path composition', () => {
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

    it('does not inject resource id into path children', () => {
      return request(app.getHttpServer())
        .patch('/settings/:setting_id/billing/1')
        .expect(404);
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

    it('uses customized parent parameter name', () => {
      return request(app.getHttpServer())
        .get('/workspaces/my-workspace/messages')
        .expect(200)
        .expect((res) => {
          expect(res.body.workspaceSlug).toBe('my-workspace');
        });
    });
  });
});
