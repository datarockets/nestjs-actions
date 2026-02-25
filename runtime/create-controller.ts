import { Controller, Delete, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import type { ActionMeta } from '../action.decorator';
import { executeActionRequest } from './execute-action';
import type { ActionClass } from './execute-action';

const METHOD_DECORATORS: Record<string, (path?: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PATCH: Patch,
  DELETE: Delete,
};

export function createControllerForAction(
  ActionClass: ActionClass,
  basePath: string,
  meta: ActionMeta,
  routeName: string,
): any {
  const isSse = meta.method.toUpperCase() === 'SSE';

  class ActionController {
    constructor(private readonly moduleRef: ModuleRef) {}

    async handle(req: Request, res: ExpressResponse) {
      return executeActionRequest(ActionClass, this.moduleRef, req, res, {
        isSse,
      });
    }
  }

  const handlerName = 'handle';
  Object.defineProperty(ActionController, 'name', {
    value: `${routeName}.${ActionClass.name}`,
  });

  Reflect.defineMetadata('design:paramtypes', [ModuleRef], ActionController);
  Controller(basePath)(ActionController);

  const descriptor = Object.getOwnPropertyDescriptor(
    ActionController.prototype,
    handlerName,
  )!;

  if (isSse) {
    Get(meta.path || undefined)(
      ActionController.prototype,
      handlerName,
      descriptor,
    );
    Req()(ActionController.prototype, handlerName, 0);
    Res()(ActionController.prototype, handlerName, 1);
  } else {
    const methodDec = METHOD_DECORATORS[meta.method.toUpperCase()] || Get;
    methodDec(meta.path || undefined)(
      ActionController.prototype,
      handlerName,
      descriptor,
    );
    Req()(ActionController.prototype, handlerName, 0);
    Res({ passthrough: true })(ActionController.prototype, handlerName, 1);
  }

  return ActionController;
}
