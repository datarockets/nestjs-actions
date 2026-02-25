import { Action, BaseAction, Before } from '../index';
import { router } from '../router';

describe('openapi/builder security', () => {
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

    expect(spec.paths['/action-sec']?.get?.security).toEqual([{ apiKey: [] }]);
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
});
