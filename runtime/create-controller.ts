import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import type { ActionClass, ActionMeta } from '../core/types';
import { executeActionRequest } from './execute-action';

const METHOD_DECORATORS: Record<string, (path?: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PUT: Put,
  PATCH: Patch,
  DELETE: Delete,
};

export type ActionControllerClass = new (moduleRef: ModuleRef) => {
  handle(req: Request, res: ExpressResponse): Promise<unknown>;
};

/**
 * Dynamically generates a NestJS controller class for a single action.
 * Applies `@Controller`, HTTP method decorators (`@Get`, `@Post`, etc.),
 * and parameter decorators (`@Req`, `@Res`) at runtime so NestJS can
 * discover and route to the action without hand-written controller boilerplate.
 * SSE actions use `@Res()` (no passthrough) to enable manual streaming.
 */
export function createControllerForAction(
  ActionClass: ActionClass,
  basePath: string,
  meta: ActionMeta,
  routeName: string,
): ActionControllerClass {
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

  return ActionController as ActionControllerClass;
}
