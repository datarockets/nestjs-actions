import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { Action, BaseAction, Before, Response } from '../index';
import { router } from '../router';
import { createTestApp } from '../tests/fixtures/router.fixtures';

describe('runtime/execute-action', () => {
  describe('SSE runtime', () => {
    let app: INestApplication;
    let sawResponseInBefore = false;

    @Action({ abstract: true })
    abstract class ProtectedSseAction extends BaseAction {
      @Before()
      authenticate() {
        sawResponseInBefore = Boolean(this.response);
        if (!this.headers['authorization']) {
          return new Response({ status: 401 });
        }
      }
    }

    @Action({ method: 'SSE' })
    class StreamAction extends ProtectedSseAction {
      async *exec() {
        yield { data: { ok: true } };
      }
    }

    @Action({ method: 'SSE', path: 'action-response' })
    class ActionResponseStreamAction extends BaseAction {
      exec() {
        return new Response({ status: 202, body: { ok: true } });
      }
    }

    beforeAll(async () => {
      const result = router.create([
        router.path('stream', {
          to: { StreamAction, ActionResponseStreamAction },
        }),
      ]);
      app = await createTestApp(result.controllers());
    });

    beforeEach(() => {
      sawResponseInBefore = false;
    });

    afterAll(() => app.close());

    it('runs before hooks for SSE actions', () => {
      return request(app.getHttpServer()).get('/stream').expect(401);
    });

    it('returns json response when SSE before hook short-circuits', () => {
      return request(app.getHttpServer())
        .get('/stream')
        .expect(401)
        .expect('Content-Type', /application\/json/)
        .expect({});
    });

    it('assigns response on SSE action instances', async () => {
      await request(app.getHttpServer()).get('/stream').expect(401);
      expect(sawResponseInBefore).toBe(true);
    });

    it('returns json response when SSE action returns Response', () => {
      return request(app.getHttpServer())
        .get('/stream/action-response')
        .expect(202)
        .expect('Content-Type', /application\/json/)
        .expect({ ok: true });
    });

    it('keeps SSE content type when action returns async generator', () => {
      return request(app.getHttpServer())
        .get('/stream')
        .set('authorization', 'Bearer token')
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);
    });

    it('streams SSE events when action returns async generator', async () => {
      const response = await request(app.getHttpServer())
        .get('/stream')
        .set('authorization', 'Bearer token')
        .expect(200);

      expect(response.text).toContain('data: {"ok":true}');
    });
  });
});
