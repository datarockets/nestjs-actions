import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { from } from 'rxjs';
import { App } from 'supertest/types';
import { z } from 'zod';
import {
  Action,
  Before,
  BaseAction,
  Response,
  router,
  NotFoundError,
} from './index';

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
  @Before()
  authenticate() {
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
    return { messages: [], ...this.params };
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
        router.resources('threads', { to: threads }, [
          router.resources('messages', { to: messages }),
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

  describe('resources with custom param', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const result = router.create([
        router.resources('workspaces', { to: threads, param: 'slug' }, [
          router.resources('messages', { to: messages }),
        ]),
      ]);
      app = await createApp(result.controllers());
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
    let app: INestApplication<App>;

    beforeAll(async () => {
      const settings = { ShowAction };
      const billing = { UpdateAction };

      const result = router.create([
        router.path('settings', { to: settings }, [
          router.path('billing', { to: billing }),
        ]),
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

  describe('sse runtime', () => {
    let app: INestApplication<App>;
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
      exec() {
        return from([{ data: { ok: true } }]);
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
      app = await createApp(result.controllers());
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

    it('keeps SSE content type when action returns Observable', () => {
      return request(app.getHttpServer())
        .get('/stream')
        .set('authorization', 'Bearer token')
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);
    });

    it('streams SSE events when action returns Observable', async () => {
      const response = await request(app.getHttpServer())
        .get('/stream')
        .set('authorization', 'Bearer token')
        .expect(200);

      expect(response.text).toContain('data: {"ok":true}');
    });
  });

  describe('spec', () => {
    it('returns paths with methods and operationIds for resources', () => {
      const result = router.create([
        router.resources('threads', { to: threads }, [
          router.resources('messages', { to: messages }),
        ]),
      ]);

      const pathParam = (name: string) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
      const ok = {
        responses: {},
      };

      expect(result.spec()).toEqual({
        paths: {
          '/threads': {
            get: { operationId: 'threads.Index', ...ok },
            post: { operationId: 'threads.Create', ...ok },
          },
          '/threads/{id}': {
            get: {
              operationId: 'threads.Show',
              parameters: [pathParam('id')],
              ...ok,
            },
            patch: {
              operationId: 'threads.Update',
              parameters: [pathParam('id')],
              ...ok,
            },
          },
          '/threads/{threadId}/messages': {
            get: {
              operationId: 'threads.messages.MessageIndex',
              parameters: [pathParam('threadId')],
              ...ok,
            },
            post: {
              operationId: 'threads.messages.MessageCreate',
              parameters: [pathParam('threadId')],
              ...ok,
            },
          },
        },
      });
    });

    it('returns paths for path routes', () => {
      const settings = { ShowAction };
      const billing = { UpdateAction };

      const result = router.create([
        router.path('settings', { to: settings }, [
          router.path('billing', { to: billing }),
        ]),
      ]);

      const pathParam = (name: string) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
      const ok = {
        responses: {},
      };

      expect(result.spec()).toEqual({
        paths: {
          '/settings/{id}': {
            get: {
              operationId: 'settings.Show',
              parameters: [pathParam('id')],
              ...ok,
            },
          },
          '/settings/billing/{id}': {
            patch: {
              operationId: 'settings.billing.Update',
              parameters: [pathParam('id')],
              ...ok,
            },
          },
        },
      });
    });

    it('uses schema from static Params when defined', () => {
      @Action({ method: 'GET', path: ':id' })
      class TypedShowAction extends BaseAction {
        static Params = z.object({
          threadId: z.string(),
          id: z.number(),
        });
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.resources('threads', { to: { TypedShowAction } }),
      ]);

      const inputErrorResponse = {
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/errors.InputError',
            },
          },
        },
      };
      const spec = result.spec();
      expect(spec.paths['/threads/{id}']).toEqual({
        get: {
          operationId: 'threads.TypedShow',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'number' },
            },
          ],
          responses: { '422': inputErrorResponse },
        },
      });
    });

    it('converts resource params with custom param option', () => {
      const result = router.create([
        router.resources('workspaces', { to: threads, param: 'slug' }, [
          router.resources('messages', { to: messages }),
        ]),
      ]);

      const paths = Object.keys(result.spec().paths);
      expect(paths).toContain('/workspaces/{workspaceSlug}/messages');
    });

    it('includes query parameters from static Query when defined', () => {
      @Action({})
      class QueryIndexAction extends BaseAction {
        static Query = z.object({
          page: z.number().optional(),
          limit: z.number(),
        });
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.resources('items', { to: { QueryIndexAction } }),
      ]);

      const inputErrorResponse = {
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/errors.InputError',
            },
          },
        },
      };
      const spec = result.spec();
      expect(spec.paths['/items']).toEqual({
        get: {
          operationId: 'items.QueryIndex',
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'number' },
            },
            {
              name: 'limit',
              in: 'query',
              required: true,
              schema: { type: 'number' },
            },
          ],
          responses: { '422': inputErrorResponse },
        },
      });
    });

    it('prepends prefix to all paths when specified', () => {
      const result = router.create([
        router.resources('threads', { to: threads }),
      ]);

      const spec = result.spec({ prefix: '/api/v1' });
      expect(Object.keys(spec.paths)).toEqual([
        '/api/v1/threads',
        '/api/v1/threads/{id}',
      ]);
    });

    it('works with auto-traversal', () => {
      const actions = { threads: { ...threads, messages } };
      const result = router.create(
        [router.resources('threads', [router.resources('messages')])],
        actions,
      );

      const spec = result.spec();
      expect(spec.paths['/threads']).toBeDefined();
      expect(spec.paths['/threads/{threadId}/messages']).toBeDefined();
    });

    it('renders inline response schemas for non-registered zod schemas', () => {
      @Action({
        openapi: {
          responses: {
            200: z.object({
              name: z.string(),
            }),
          },
        },
      })
      class InlineResponseAction extends BaseAction {
        exec() {
          return { name: 'thread' };
        }
      }

      const result = router.create([
        router.path('inline', { to: { InlineResponseAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/inline']).toEqual({
        get: {
          operationId: 'inline.InlineResponse',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                    },
                    required: ['name'],
                  },
                },
              },
            },
          },
        },
      });
      expect(spec.components).toBeUndefined();
    });

    it('renders response schemas as refs for globally registered zod schemas', () => {
      @Action({
        openapi: {
          responses: {
            404: NotFoundError.Schema,
          },
        },
      })
      class RefResponseAction extends BaseAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('missing', { to: { RefResponseAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/missing']?.get?.responses['404']).toEqual({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/errors.NotFoundError',
            },
          },
        },
      });
      expect(spec.components?.schemas['errors.NotFoundError']).toBeDefined();
    });

    it('includes static Response schema with status from meta', () => {
      @Action({})
      class StaticResponseAction extends BaseAction {
        static readonly Response = z
          .object({
            name: z.string(),
          })
          .meta({ openapi: { response: { status: 200 } } });

        exec() {
          return { name: 'test' };
        }
      }

      const result = router.create([
        router.path('static', { to: { StaticResponseAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/static']?.get?.responses['200']).toEqual({
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
          },
        },
      });
    });

    it('uses $ref for static Response with registered nested schemas', () => {
      const NestedSchema = z
        .object({ value: z.number() })
        .meta({ id: 'test.Nested' });

      @Action({})
      class NestedRefAction extends BaseAction {
        static readonly Response = z
          .object({ nested: NestedSchema })
          .meta({ openapi: { response: { status: 200 } } });

        exec() {
          return { nested: { value: 1 } };
        }
      }

      const result = router.create([
        router.path('nested', { to: { NestedRefAction } }),
      ]);
      const spec = result.spec();

      expect(
        spec.paths['/nested']?.get?.responses['200']?.content?.[
          'application/json'
        ].schema,
      ).toEqual({
        type: 'object',
        properties: {
          nested: { $ref: '#/components/schemas/test.Nested' },
        },
        required: ['nested'],
      });
      expect(spec.components?.schemas['test.Nested']).toBeDefined();
    });

    it('defaults to status 200 when static Response has no status in meta', () => {
      @Action({})
      class DefaultStatusAction extends BaseAction {
        static readonly Response = z.object({ ok: z.boolean() });

        exec() {
          return { ok: true };
        }
      }

      const result = router.create([
        router.path('default-status', { to: { DefaultStatusAction } }),
      ]);
      const spec = result.spec();

      expect(
        spec.paths['/default-status']?.get?.responses['200'],
      ).toBeDefined();
      expect(
        spec.paths['/default-status']?.get?.responses['200']?.content?.[
          'application/json'
        ],
      ).toBeDefined();
    });

    it('merges static Response with before hook responses', () => {
      @Action({ abstract: true })
      abstract class HookParent extends BaseAction {
        @Before({
          openapi: {
            responses: {
              401: z.object({ code: z.literal('unauthorized') }),
            },
          },
        })
        authenticate() {}
      }

      @Action({})
      class MergedAction extends HookParent {
        static readonly Response = z
          .object({ data: z.string() })
          .meta({ openapi: { response: { status: 200 } } });

        exec() {
          return { data: 'hello' };
        }
      }

      const result = router.create([
        router.path('merged', { to: { MergedAction } }),
      ]);
      const spec = result.spec();
      const responses = spec.paths['/merged']?.get?.responses;

      expect(responses?.['200']).toBeDefined();
      expect(responses?.['401']).toBeDefined();
    });

    it('includes before hook response schemas from parent actions', () => {
      @Action({ abstract: true })
      abstract class ParentAction extends BaseAction {
        @Before({
          openapi: {
            responses: {
              401: z.object({
                code: z.literal('unauthorized'),
              }),
            },
          },
        })
        authenticate() {}
      }

      @Action({})
      class ChildAction extends ParentAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('protected', { to: { ChildAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/protected']?.get?.responses['401']).toEqual({
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { type: 'string', const: 'unauthorized' },
              },
              required: ['code'],
            },
          },
        },
      });
    });

    it('includes inline ResponseItem schema for SSE actions', () => {
      @Action({ method: 'SSE' })
      class SseStreamAction extends BaseAction {
        static readonly ResponseItem = z.object({
          symbol: z.string(),
          price: z.string(),
        });

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('stream', { to: { SseStreamAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/stream']?.get?.responses['200']).toEqual({
        content: {
          'text/event-stream': {
            schema: { type: 'string' },
            itemSchema: {
              type: 'object',
              properties: {
                symbol: { type: 'string' },
                price: { type: 'string' },
              },
              required: ['symbol', 'price'],
            },
          },
        },
      });
    });

    it('uses $ref for ResponseItem with registered id', () => {
      const SseItem = z
        .object({ value: z.number() })
        .meta({ id: 'test.SseItem' });

      @Action({ method: 'SSE' })
      class SseRefAction extends BaseAction {
        static readonly ResponseItem = SseItem;

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('sse-ref', { to: { SseRefAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/sse-ref']?.get?.responses['200']).toEqual({
        content: {
          'text/event-stream': {
            schema: { type: 'string' },
            itemSchema: {
              $ref: '#/components/schemas/test.SseItem',
            },
          },
        },
      });
      expect(spec.components?.schemas['test.SseItem']).toBeDefined();
    });

    it('merges ResponseItem with before hook responses for SSE actions', () => {
      @Action({ abstract: true })
      abstract class SseParent extends BaseAction {
        @Before({
          openapi: {
            responses: {
              401: z.object({ code: z.literal('unauthorized') }),
            },
          },
        })
        authenticate() {}
      }

      @Action({ method: 'SSE' })
      class SseMergedAction extends SseParent {
        static readonly ResponseItem = z.object({ data: z.string() });

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('sse-merged', { to: { SseMergedAction } }),
      ]);
      const spec = result.spec();
      const responses = spec.paths['/sse-merged']?.get?.responses;

      expect(responses?.['200']?.content?.['text/event-stream']).toBeDefined();
      expect(responses?.['401']?.content?.['application/json']).toBeDefined();
    });

    it('ignores static Response on SSE actions', () => {
      @Action({ method: 'SSE' })
      class SseWithResponseAction extends BaseAction {
        static readonly Response = z
          .object({ name: z.string() })
          .meta({ openapi: { response: { status: 200 } } });

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('sse-ignored', { to: { SseWithResponseAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/sse-ignored']?.get?.responses).toEqual({});
    });

    it('includes inline requestBody from static Request', () => {
      @Action({ method: 'POST' })
      class RequestBodyAction extends BaseAction {
        static Request = z.object({
          name: z.string(),
          age: z.number().optional(),
        });

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('with-body', { to: { RequestBodyAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/with-body']?.post?.requestBody).toEqual({
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name'],
            },
          },
        },
      });
    });

    it('uses $ref for Request with registered id', () => {
      const RequestSchema = z
        .object({ title: z.string() })
        .meta({ id: 'test.CreateRequest' });

      @Action({ method: 'POST' })
      class RefRequestAction extends BaseAction {
        static Request = RequestSchema;

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('ref-body', { to: { RefRequestAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/ref-body']?.post?.requestBody).toEqual({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/test.CreateRequest',
            },
          },
        },
      });
      expect(spec.components?.schemas['test.CreateRequest']).toBeDefined();
    });

    it('fixes $ref inside component schemas and includes transitive references', () => {
      const PartA = z
        .object({ type: z.literal('a'), value: z.string() })
        .meta({ id: 'test.PartA' });
      const PartB = z
        .object({ type: z.literal('b'), value: z.number() })
        .meta({ id: 'test.PartB' });
      const Container = z
        .object({ parts: z.array(z.union([PartA, PartB])) })
        .meta({ id: 'test.Container' });

      @Action({
        openapi: { responses: { 200: Container } },
      })
      class ContainerAction extends BaseAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('container', { to: { ContainerAction } }),
      ]);
      const spec = result.spec();

      const containerSchema = spec.components?.schemas['test.Container'];
      expect(containerSchema).toBeDefined();
      expect(containerSchema?.['$schema']).toBeUndefined();
      expect(containerSchema?.['id']).toBeUndefined();

      const raw = JSON.stringify(containerSchema);
      expect(raw).toContain('#/components/schemas/test.PartA');
      expect(raw).toContain('#/components/schemas/test.PartB');
      expect(raw).not.toMatch(/"\$ref"\s*:\s*"test\.Part[AB]"/);

      expect(spec.components?.schemas['test.PartA']).toBeDefined();
      expect(spec.components?.schemas['test.PartB']).toBeDefined();
    });

    it('omits requestBody when no static Request is defined', () => {
      @Action({ method: 'POST' })
      class NoRequestAction extends BaseAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('no-body', { to: { NoRequestAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/no-body']?.post?.requestBody).toBeUndefined();
    });

    it('ignores static Request on SSE actions', () => {
      @Action({ method: 'SSE' })
      class SseWithRequestAction extends BaseAction {
        static Request = z.object({ data: z.string() });

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('sse-no-body', { to: { SseWithRequestAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/sse-no-body']?.get?.requestBody).toBeUndefined();
    });

    it('includes security from @Before decorator', () => {
      @Action({ abstract: true })
      abstract class SecureAction extends BaseAction {
        @Before({
          openapi: {
            security: [{ oauth2: ['openid'] }],
          },
        })
        authenticate() {}
      }

      @Action({})
      class SecureIndexAction extends SecureAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('secure', { to: { SecureIndexAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/secure']?.get?.security).toEqual([
        { oauth2: ['openid'] },
      ]);
    });

    it('includes security from @Action decorator', () => {
      @Action({
        openapi: {
          security: [{ apiKey: [] }],
        },
      })
      class ActionSecurityAction extends BaseAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('action-sec', { to: { ActionSecurityAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/action-sec']?.get?.security).toEqual([
        { apiKey: [] },
      ]);
    });

    it('@Action security overrides @Before security', () => {
      @Action({ abstract: true })
      abstract class ParentSecAction extends BaseAction {
        @Before({
          openapi: {
            security: [{ oauth2: [] }],
          },
        })
        authenticate() {}
      }

      @Action({
        openapi: {
          security: [{ apiKey: [] }],
        },
      })
      class OverrideAction extends ParentSecAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('override', { to: { OverrideAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/override']?.get?.security).toEqual([{ apiKey: [] }]);
    });

    it('child @Before security overrides parent @Before security', () => {
      @Action({ abstract: true })
      abstract class ParentAction extends BaseAction {
        @Before({
          openapi: {
            security: [{ oauth2: [] }],
          },
        })
        authenticate() {}
      }

      @Action({})
      class ChildAction extends ParentAction {
        @Before({
          openapi: {
            security: [{ apiKey: [] }],
          },
        })
        checkApiKey() {}

        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('child-sec', { to: { ChildAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/child-sec']?.get?.security).toEqual([{ apiKey: [] }]);
    });

    it('omits security when none is defined', () => {
      @Action({})
      class NoSecurityAction extends BaseAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('no-sec', { to: { NoSecurityAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/no-sec']?.get?.security).toBeUndefined();
    });

    it('includes securitySchemes in components when passed to spec()', () => {
      @Action({})
      class SimpleAction extends BaseAction {
        exec() {
          return {};
        }
      }

      const result = router.create([
        router.path('simple', { to: { SimpleAction } }),
      ]);
      const spec = result.spec({
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://example.com/authorize',
                tokenUrl: 'https://example.com/token',
              },
            },
          },
        },
      });

      expect(spec.components?.securitySchemes).toEqual({
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/authorize',
              tokenUrl: 'https://example.com/token',
            },
          },
        },
      });
    });

    it('uses description from zod schema meta', () => {
      @Action({
        openapi: {
          responses: {
            201: z
              .object({ id: z.string() })
              .meta({ description: 'Created user' }),
          },
        },
      })
      class DescribedAction extends BaseAction {
        exec() {
          return { id: '1' };
        }
      }

      const result = router.create([
        router.path('described', { to: { DescribedAction } }),
      ]);
      const spec = result.spec();

      expect(spec.paths['/described']?.get?.responses['201']).toEqual({
        description: 'Created user',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
              required: ['id'],
            },
          },
        },
      });
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
