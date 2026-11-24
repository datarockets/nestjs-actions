import { buildSpec } from './openapi/builder';
import type { Spec as OpenApiSpec, SpecOptions } from './openapi/types';
import { routePath, routeResources } from './routing/dsl';
import { processRoutes } from './routing/process-routes';
import type { ActionModule, RouteNode } from './routing/types';

export type Spec = OpenApiSpec;

/**
 * Creates a router instance from a route tree.
 * Processes the route nodes into NestJS controllers and OpenAPI spec entries.
 * When `actionsMap` is provided, the router auto-traverses it by path key
 * to resolve action modules without explicit `{ to: ... }` options.
 */
function create(routes: RouteNode[], actionsMap?: ActionModule) {
  const { controllers, specEntries } = processRoutes(routes, actionsMap);

  return {
    controllers() {
      return controllers;
    },

    spec(options?: SpecOptions): OpenApiSpec {
      return buildSpec(specEntries, options);
    },
  };
}

/**
 * Top-level router orchestrator.
 * Use `router.create()` to build controllers and spec from a route tree,
 * `router.path()` and `router.resources()` to define route nodes.
 */
export const router = {
  create,
  path: routePath,
  resources: routeResources,
};
