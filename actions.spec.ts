import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Action, BaseAction, Response, router } from './index';

@Action({})
class IndexAction extends BaseAction {
  async exec() {
    return { items: [] };
  }
}

@Action({ method: 'POST' })
class CreateAction extends BaseAction {
  async exec() {
    return new Response({ status: 201, body: { id: '1' } });
  }
}

@Action({ method: 'GET', path: ':id' })
class ShowAction extends BaseAction {
  async exec() {
    return { id: this.params['id'] };
  }
}

@Action({ abstract: true })
abstract class AbstractAction extends BaseAction {
  before() {
    if (!this.headers['authorization']) {
      return new Response({ status: 401 });
    }
  }
}

@Action({ method: 'PATCH', path: ':id' })
class UpdateAction extends AbstractAction {
  async exec() {
    return { updated: true };
  }
}

const threads = { IndexAction, CreateAction, ShowAction, UpdateAction };

@Action({})
class MessageIndexAction extends BaseAction {
  async exec() {
    return { messages: [] };
  }
}

@Action({ method: 'POST' })
class MessageCreateAction extends BaseAction {
  async exec() {
    return new Response({ status: 201, body: { id: 'm1' } });
  }
}

const messages = { MessageIndexAction, MessageCreateAction };

async function createApp(controllers: any[]): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    controllers,
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('router', () => {
  describe('resources with explicit modules', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const result = router.create([
        router.resources('threads', threads, [
          router.resources('messages', messages),
        ]),
      ]);
      app = await createApp(result.controllers());
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
      return request(app.getHttpServer())
        .patch('/threads/42')
        .expect(401);
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
        .expect({ messages: [] });
    });

    it('POST /threads/:thread_id/messages', () => {
      return request(app.getHttpServer())
        .post('/threads/1/messages')
        .expect(201)
        .expect({ id: 'm1' });
    });
  });

  describe('resources with auto-traversal', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const actions = { threads: { ...threads, messages } };
      const result = router.create(
        [router.resources('threads', [router.resources('messages')])],
        actions,
      );
      app = await createApp(result.controllers());
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

  describe('path routes', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const settings = { ShowAction };
      const billing = { UpdateAction };

      const result = router.create([
        router.path('settings', settings, [router.path('billing', billing)]),
      ]);
      app = await createApp(result.controllers());
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
    let app: INestApplication<App>;

    beforeAll(async () => {
      const actions = {
        settings: { ShowAction, billing: { UpdateAction } },
      };

      const result = router.create(
        [router.path('settings', [router.path('billing')])],
        actions,
      );
      app = await createApp(result.controllers());
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
