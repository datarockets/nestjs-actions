import { routePath, routeResources } from './dsl';

describe('routing/dsl', () => {
  describe('routePath', () => {
    it('creates a path node with module and children', () => {
      const child = routePath('child');

      expect(
        routePath('settings', { to: { test: true } as never }, [child]),
      ).toEqual({
        type: 'path',
        path: 'settings',
        module: { test: true },
        children: [child],
      });
    });

    it('treats second argument as children when it is an array', () => {
      const children = [routePath('billing')];

      expect(routePath('settings', children)).toEqual({
        type: 'path',
        path: 'settings',
        children,
      });
    });
  });

  describe('routeResources', () => {
    it('creates a resources node with module, param and children', () => {
      const child = routeResources('messages');

      expect(
        routeResources(
          'threads',
          { to: { test: true } as never, param: 'slug' },
          [child],
        ),
      ).toEqual({
        type: 'resources',
        path: 'threads',
        param: 'slug',
        module: { test: true },
        children: [child],
      });
    });

    it('treats second argument as children when it is an array', () => {
      const children = [routeResources('messages')];

      expect(routeResources('threads', children)).toEqual({
        type: 'resources',
        path: 'threads',
        children,
      });
    });
  });
});
