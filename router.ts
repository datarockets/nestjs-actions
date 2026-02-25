import { getActionMeta, isActionClass } from './action.decorator';
import { BaseAction } from './base-action';
import { buildSpec } from './openapi/builder';
import type {
  Spec as OpenApiSpec,
  SpecEntry,
  SpecOptions,
} from './openapi/types';
import { createControllerForAction } from './runtime/create-controller';
import { singularize } from './singularize';

type ActionModule = Record<string, any>;

interface RouteOptions {
  to: ActionModule;
}

interface ResourcesOptions {
  to?: ActionModule;
  param?: string;
}

interface RouteNode {
  type: 'path' | 'resources';
  path: string;
  param?: string;
  module?: ActionModule;
  children?: RouteNode[];
}

function extractActions(module: ActionModule): (new () => BaseAction)[] {
  return Object.values(module).filter(
    isActionClass,
  ) as (new () => BaseAction)[];
}

function routeNameFromPath(path: string): string {
  return path
    .split('/')
    .filter((s) => s && !s.startsWith(':'))
    .join('.');
}

function toOpenApiPath(path: string): string {
  return '/' + path.replace(/:(\w+)/g, '{$1}');
}

function routePath(
  path: string,
  optionsOrChildren?: RouteOptions | RouteNode[],
  children?: RouteNode[],
): RouteNode {
  if (Array.isArray(optionsOrChildren)) {
    return { type: 'path', path, children: optionsOrChildren };
  }
  return { type: 'path', path, module: optionsOrChildren?.to, children };
}

function routeResources(
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

export type Spec = OpenApiSpec;

function create(routes: RouteNode[], actionsMap?: ActionModule) {
  const controllers: any[] = [];
  const specEntries: SpecEntry[] = [];

  function processRoutes(
    nodes: RouteNode[],
    basePath: string,
    currentMap?: ActionModule,
  ) {
    for (const node of nodes) {
      const resolvedModule =
        node.module || (currentMap ? currentMap[node.path] : undefined);
      const fullPath = basePath ? `${basePath}/${node.path}` : node.path;

      if (resolvedModule) {
        const actions = extractActions(resolvedModule);
        for (const ActionClass of actions) {
          const meta = getActionMeta(ActionClass);
          if (meta.abstract) continue;
          const routeName = routeNameFromPath(fullPath);
          controllers.push(
            createControllerForAction(ActionClass, fullPath, meta, routeName),
          );

          const actionPath = meta.path ? `${fullPath}/${meta.path}` : fullPath;
          const name = ActionClass.name.replace(/Action$/, '');
          const operationId = routeName ? `${routeName}.${name}` : name;

          const isSse = meta.method.toUpperCase() === 'SSE';
          specEntries.push({
            path: toOpenApiPath(actionPath),
            method: isSse ? 'get' : meta.method.toLowerCase(),
            operationId,
            actionClass: ActionClass,
            isSse,
          });
        }
      }

      if (node.children) {
        let childBasePath = fullPath;
        if (node.type === 'resources') {
          const paramName = node.param
            ? `${singularize(node.path)}${node.param[0].toUpperCase()}${node.param.slice(1)}`
            : `${singularize(node.path)}Id`;
          childBasePath = `${fullPath}/:${paramName}`;
        }
        processRoutes(node.children, childBasePath, resolvedModule);
      }
    }
  }

  processRoutes(routes, '', actionsMap);

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
