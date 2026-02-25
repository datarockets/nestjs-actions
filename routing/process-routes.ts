import { getActionMeta, isActionClass } from '../core/action.decorator';
import { BaseAction } from '../core/base-action';
import type { SpecEntry } from '../openapi/types';
import type { ActionControllerClass } from '../runtime/create-controller';
import { createControllerForAction } from '../runtime/create-controller';
import { singularize } from '../utils/singularize';
import type { ActionModule, RouteNode } from './types';

interface ProcessedRoutes {
  controllers: ActionControllerClass[];
  specEntries: SpecEntry[];
}

function extractActions(module: ActionModule): (new () => BaseAction)[] {
  return Object.values(module).filter(
    isActionClass,
  ) as (new () => BaseAction)[];
}

function routeNameFromPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment && !segment.startsWith(':'))
    .join('.');
}

function toOpenApiPath(path: string): string {
  return '/' + path.replace(/:(\w+)/g, '{$1}');
}

export function processRoutes(
  nodes: RouteNode[],
  actionsMap?: ActionModule,
): ProcessedRoutes {
  const controllers: ActionControllerClass[] = [];
  const specEntries: SpecEntry[] = [];

  function visitRoutes(
    currentNodes: RouteNode[],
    basePath: string,
    currentMap?: ActionModule,
  ) {
    for (const node of currentNodes) {
      const moduleFromMap = currentMap?.[node.path];
      const resolvedModule =
        node.module ??
        (typeof moduleFromMap === 'object' && moduleFromMap !== null
          ? (moduleFromMap as ActionModule)
          : undefined);
      const fullPath = basePath ? `${basePath}/${node.path}` : node.path;

      if (resolvedModule) {
        const actions = extractActions(resolvedModule);
        for (const ActionClass of actions) {
          const meta = getActionMeta(ActionClass);
          if (meta.abstract) {
            continue;
          }

          const routeName = routeNameFromPath(fullPath);
          controllers.push(
            createControllerForAction(ActionClass, fullPath, meta, routeName),
          );

          const actionPath = meta.path ? `${fullPath}/${meta.path}` : fullPath;
          const actionName = ActionClass.name.replace(/Action$/, '');
          const operationId = routeName
            ? `${routeName}.${actionName}`
            : actionName;
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

      if (!node.children) {
        continue;
      }

      let childBasePath = fullPath;
      if (node.type === 'resources') {
        const paramName = node.param
          ? `${singularize(node.path)}${node.param[0].toUpperCase()}${node.param.slice(1)}`
          : `${singularize(node.path)}Id`;
        childBasePath = `${fullPath}/:${paramName}`;
      }

      visitRoutes(node.children, childBasePath, resolvedModule);
    }
  }

  visitRoutes(nodes, '', actionsMap);

  return {
    controllers,
    specEntries,
  };
}
