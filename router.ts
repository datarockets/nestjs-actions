import { Controller, Get, Post, Patch, Delete, Req, Res } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import { getActionMeta, isActionClass, ActionMeta } from './action.decorator';
import { BaseAction } from './base-action';
import { Response } from './response';
import { singularize } from './singularize';

type ActionModule = Record<string, any>;

interface RouteNode {
  type: 'path' | 'resources';
  path: string;
  module?: ActionModule;
  children?: RouteNode[];
}

const METHOD_DECORATORS: Record<string, (path?: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PATCH: Patch,
  DELETE: Delete,
};

let controllerCounter = 0;

function extractActions(module: ActionModule): (new () => BaseAction)[] {
  return Object.values(module).filter(
    isActionClass,
  ) as (new () => BaseAction)[];
}

function createControllerForAction(
  ActionClass: new () => BaseAction,
  basePath: string,
  meta: ActionMeta,
) {
  const id = controllerCounter++;

  class ActionController {
    constructor(private readonly moduleRef: ModuleRef) {}

    async handle(req: Request, res: ExpressResponse) {
      const action = new ActionClass();
      action.request = req;
      action.response = res;
      action.moduleRef = this.moduleRef;

      const beforeResult = await action.before();
      if (beforeResult instanceof Response) {
        res.status(beforeResult.status);
        return beforeResult.body;
      }
      if (beforeResult !== undefined) {
        return beforeResult;
      }

      const result = await action.exec();
      if (result instanceof Response) {
        res.status(result.status);
        return result.body;
      }
      return result;
    }
  }

  Object.defineProperty(ActionController, 'name', {
    value: `ActionController_${ActionClass.name}_${id}`,
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
  moduleOrChildren?: ActionModule | RouteNode[],
  children?: RouteNode[],
): RouteNode {
  if (Array.isArray(moduleOrChildren)) {
    return { type: 'path', path, children: moduleOrChildren };
  }
  return { type: 'path', path, module: moduleOrChildren, children };
}

function routeResources(
  path: string,
  moduleOrChildren?: ActionModule | RouteNode[],
  children?: RouteNode[],
): RouteNode {
  if (Array.isArray(moduleOrChildren)) {
    return { type: 'resources', path, children: moduleOrChildren };
  }
  return { type: 'resources', path, module: moduleOrChildren, children };
}

function create(routes: RouteNode[], actionsMap?: ActionModule) {
  const controllers: any[] = [];

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
        }
      }

      if (node.children) {
        let childBasePath = fullPath;
        if (node.type === 'resources') {
          childBasePath = `${fullPath}/:${singularize(node.path)}_id`;
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
  };
}

export const router = {
  create,
  path: routePath,
  resources: routeResources,
};
