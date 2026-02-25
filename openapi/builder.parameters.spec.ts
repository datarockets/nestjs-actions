import { z } from 'zod';

import { Action, BaseAction } from '../index';
import { router } from '../router';
import { inputErrorResponse } from '../tests/fixtures/router.fixtures';

describe('openapi/builder parameters', () => {
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
});
