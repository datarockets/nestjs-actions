import type { ResourcesOptions, RouteNode, RouteOptions } from './types';

/**
 * Creates a non-resourceful route node. The path is joined as-is with
 * the parent path and does not generate an `:id` parameter for children.
 * Accepts either `{ to: module }` options or an array of child nodes directly.
 */
export function routePath(
  path: string,
  optionsOrChildren?: RouteOptions | RouteNode[],
  children?: RouteNode[],
): RouteNode {
  if (Array.isArray(optionsOrChildren)) {
    return { type: 'path', path, children: optionsOrChildren };
  }

  return { type: 'path', path, module: optionsOrChildren?.to, children };
}

/**
 * Creates a resourceful route node. Children are nested under an
 * auto-generated `:singularizedNameId` parameter (e.g., `threads` produces
 * `:threadId`). Use `{ param: 'slug' }` to customize the parameter name.
 */
export function routeResources(
  path: string,
  optionsOrChildren?: ResourcesOptions | RouteNode[],
  children?: RouteNode[],
): RouteNode {
  if (Array.isArray(optionsOrChildren)) {
    return { type: 'resources', path, children: optionsOrChildren };
  }

  return {
    type: 'resources',
    path,
    param: optionsOrChildren?.param,
    module: optionsOrChildren?.to,
    children,
  };
}
