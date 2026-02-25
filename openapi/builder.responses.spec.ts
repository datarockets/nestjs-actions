import { z } from 'zod';

import { Action, BaseAction, Before } from '../index';
import { NotFoundError } from '../responses';
import { router } from '../router';

describe('openapi/builder responses', () => {
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

    expect(spec.paths['/default-status']?.get?.responses['200']).toBeDefined();
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
