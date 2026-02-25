import { buildSpec } from './openapi/builder';
import type { Spec as OpenApiSpec, SpecOptions } from './openapi/types';
import { routePath, routeResources } from './routing/dsl';
import { processRoutes } from './routing/process-routes';
import type { ActionModule, RouteNode } from './routing/types';

export type Spec = OpenApiSpec;

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

export const router = {
  create,
  path: routePath,
  resources: routeResources,
};
