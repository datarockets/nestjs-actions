import { INestApplication, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { z } from 'zod';

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

    @Action({ method: 'SSE', path: 'unknown-error' })
    class UnknownErrorStreamAction extends BaseAction {
      async *exec() {
        throw new Error('SELECT * FROM users -- db connection refused');
      }
    }

    @Action({ method: 'SSE', path: 'http-error' })
    class HttpErrorStreamAction extends BaseAction {
      async *exec() {
        throw new NotFoundException('secret-resource-id-12345');
      }
    }

    @Action({ method: 'SSE', path: 'zod-error' })
    class ZodErrorStreamAction extends BaseAction {
      async *exec() {
        z.object({ name: z.string() }).parse({ name: 123 });
      }
    }

    @Action({ method: 'SSE', path: 'partial-then-error' })
    class PartialThenErrorStreamAction extends BaseAction {
      async *exec() {
        yield { data: { chunk: 1 } };
        throw new Error('mid-stream failure with internal details');
      }
    }

    beforeAll(async () => {
      const result = router.create([
        router.path('stream', {
          to: {
            StreamAction,
            ActionResponseStreamAction,
            UnknownErrorStreamAction,
            HttpErrorStreamAction,
            ZodErrorStreamAction,
            PartialThenErrorStreamAction,
          },
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

    it('returns structured error body when SSE before hook short-circuits without body', () => {
      return request(app.getHttpServer())
        .get('/stream')
        .expect(401)
        .expect('Content-Type', /application\/json/)
        .expect({ code: 'unauthorized' });
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

    describe('SSE error sanitization', () => {
      it('sends generic application-error for unknown errors', async () => {
        const response = await request(app.getHttpServer())
          .get('/stream/unknown-error')
          .expect(200);

        expect(response.text).toContain('event: error');
        expect(response.text).toContain('data: application-error');
        expect(response.text).not.toContain('SELECT');
        expect(response.text).not.toContain('db connection refused');
      });

      it('sends mapped status code for HttpException errors', async () => {
        const response = await request(app.getHttpServer())
          .get('/stream/http-error')
          .expect(200);

        expect(response.text).toContain('event: error');
        expect(response.text).toContain('data: not-found');
        expect(response.text).not.toContain('secret-resource-id-12345');
      });

      it('sends input-error for ZodError', async () => {
        const response = await request(app.getHttpServer())
          .get('/stream/zod-error')
          .expect(200);

        expect(response.text).toContain('event: error');
        expect(response.text).toContain('data: input-error');
      });

      it('sends error event after partial stream data', async () => {
        const response = await request(app.getHttpServer())
          .get('/stream/partial-then-error')
          .expect(200);

        expect(response.text).toContain('data: {"chunk":1}');
        expect(response.text).toContain('event: error');
        expect(response.text).toContain('data: application-error');
        expect(response.text).not.toContain('mid-stream failure');
        expect(response.text).not.toContain('internal details');
      });
    });
  });
});
