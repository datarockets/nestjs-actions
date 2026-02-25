import type { ResourcesOptions, RouteNode, RouteOptions } from './types';

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
