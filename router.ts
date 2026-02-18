import { Controller, Get, Post, Patch, Delete, Req, Res } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import { getActionMeta, isActionClass, ActionMeta } from './action.decorator';
import { BaseAction } from './base-action';
import { Response } from './response';
import { runBeforeHooks } from './before.decorator';
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

const METHOD_DECORATORS: Record<string, (path?: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PATCH: Patch,
  DELETE: Delete,
};

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

function createControllerForAction(
  ActionClass: new () => BaseAction,
  basePath: string,
  meta: ActionMeta,
) {
  class ActionController {
    constructor(private readonly moduleRef: ModuleRef) {}

    async handle(req: Request, res: ExpressResponse) {
      const action = new ActionClass();
      action.request = req;
      action.response = res;
      action.moduleRef = this.moduleRef;

      const beforeResult = await runBeforeHooks(action);
      if (beforeResult instanceof Response) {
        res.status(beforeResult.status);
        return beforeResult.body;
      }

      const result = await action.exec();
      if (result instanceof Response) {
        res.status(result.status);
        return result.body;
      }
      return result;
    }
  }

  const routeName = routeNameFromPath(basePath);
  Object.defineProperty(ActionController, 'name', {
    value: `${routeName}.${ActionClass.name}`,
  });

  Reflect.defineMetadata('design:paramtypes', [ModuleRef], ActionController);
  Controller(basePath)(ActionController);

  const descriptor = Object.getOwnPropertyDescriptor(
    ActionController.prototype,
    'handle',
  )!;
  const methodDec = METHOD_DECORATORS[meta.method.toUpperCase()] || Get;
  methodDec(meta.path || undefined)(
    ActionController.prototype,
    'handle',
    descriptor,
  );

  Req()(ActionController.prototype, 'handle', 0);
  Res({ passthrough: true })(ActionController.prototype, 'handle', 1);

  return ActionController;
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

interface SpecPathOperation {
  operationId: string;
  responses: Record<string, { description: string }>;
}

type SpecPaths = Record<string, Record<string, SpecPathOperation>>;

export interface Spec {
  paths: SpecPaths;
}

function create(routes: RouteNode[], actionsMap?: ActionModule) {
  const controllers: any[] = [];
  const specEntries: { path: string; method: string; operationId: string }[] =
    [];

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
          controllers.push(
            createControllerForAction(ActionClass, fullPath, meta),
          );

          const actionPath = meta.path ? `${fullPath}/${meta.path}` : fullPath;
          const routeName = routeNameFromPath(fullPath);
          const name = ActionClass.name.replace(/Action$/, '');
          const operationId = routeName ? `${routeName}.${name}` : name;

          specEntries.push({
            path: toOpenApiPath(actionPath),
            method: meta.method.toLowerCase(),
            operationId,
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

    spec(options?: { prefix?: string }): Spec {
      const prefix = options?.prefix || '';
      const paths: SpecPaths = {};
      for (const entry of specEntries) {
        const path = prefix ? `${prefix}${entry.path}` : entry.path;
        if (!paths[path]) paths[path] = {};
        paths[path][entry.method] = {
          operationId: entry.operationId,
          responses: {
            '200': { description: 'Successful response' },
          },
        };
      }
      return { paths };
    },
  };
}

export const router = {
  create,
  path: routePath,
  resources: routeResources,
};
