import { router } from '../router';
import {
  ShowAction,
  UpdateAction,
  messages,
  okResponse,
  pathParam,
  threads,
} from '../tests/fixtures/router.fixtures';

describe('routing/process-routes', () => {
  it('returns paths with methods and operationIds for resources', () => {
    const result = router.create([
      router.resources('threads', { to: threads }, [
        router.resources('messages', { to: messages }),
      ]),
    ]);

    expect(result.spec()).toEqual({
      paths: {
        '/threads': {
          get: { operationId: 'threads.Index', ...okResponse },
          post: { operationId: 'threads.Create', ...okResponse },
        },
        '/threads/{id}': {
          get: {
            operationId: 'threads.Show',
            parameters: [pathParam('id')],
            ...okResponse,
          },
          patch: {
            operationId: 'threads.Update',
            parameters: [pathParam('id')],
            ...okResponse,
          },
        },
        '/threads/{threadId}/messages': {
          get: {
            operationId: 'threads.messages.MessageIndex',
            parameters: [pathParam('threadId')],
            ...okResponse,
          },
          post: {
            operationId: 'threads.messages.MessageCreate',
            parameters: [pathParam('threadId')],
            ...okResponse,
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

    expect(result.spec()).toEqual({
      paths: {
        '/settings/{id}': {
          get: {
            operationId: 'settings.Show',
            parameters: [pathParam('id')],
            ...okResponse,
          },
        },
        '/settings/billing/{id}': {
          patch: {
            operationId: 'settings.billing.Update',
            parameters: [pathParam('id')],
            ...okResponse,
          },
        },
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
});
