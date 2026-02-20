import 'reflect-metadata';
import { z } from 'zod';
import { Response } from './response';

const BEFORE_HOOKS_KEY = 'action:before-hooks';
const BEFORE_HOOK_OPENAPI_RESPONSES_KEY =
  'action:before-hook:openapi:responses';

export interface BeforeOptions {
  openapi?: {
    responses?: Record<number, z.ZodType>;
  };
}

export function Before(options?: BeforeOptions): MethodDecorator {
  return (target, propertyKey) => {
    const hooks: string[] =
      Reflect.getOwnMetadata(BEFORE_HOOKS_KEY, target) || [];
    hooks.push(propertyKey as string);
    Reflect.defineMetadata(BEFORE_HOOKS_KEY, hooks, target);

    Reflect.defineMetadata(
      BEFORE_HOOK_OPENAPI_RESPONSES_KEY,
      options?.openapi?.responses,
      target,
      propertyKey,
    );
  };
}

export function getBeforeHooks(instance: object): string[] {
  const chain: string[][] = [];
  let proto = Object.getPrototypeOf(instance);

  while (proto && proto !== Object.prototype) {
    const hooks: string[] =
      Reflect.getOwnMetadata(BEFORE_HOOKS_KEY, proto) || [];
    if (hooks.length > 0) {
      chain.unshift(hooks);
    }
    proto = Object.getPrototypeOf(proto);
  }

  return chain.flat();
}

export function getBeforeHookResponses(
  instance: object,
): Record<number, z.ZodType>[] {
  const responses: Record<number, z.ZodType>[][] = [];
  let proto = Object.getPrototypeOf(instance);

  while (proto && proto !== Object.prototype) {
    const hooks: string[] =
      Reflect.getOwnMetadata(BEFORE_HOOKS_KEY, proto) || [];
    const hookResponsesForProto: Record<number, z.ZodType>[] = [];

    for (const hook of hooks) {
      const hookResponses = Reflect.getOwnMetadata(
        BEFORE_HOOK_OPENAPI_RESPONSES_KEY,
        proto,
        hook,
      ) as Record<number, z.ZodType> | undefined;
      if (hookResponses) {
        hookResponsesForProto.push(hookResponses);
      }
    }

    if (hookResponsesForProto.length > 0) {
      responses.unshift(hookResponsesForProto);
    }

    proto = Object.getPrototypeOf(proto);
  }

  return responses.flat();
}

export async function runBeforeHooks(
  instance: object,
): Promise<Response | void> {
  const hooks = getBeforeHooks(instance);

  for (const hook of hooks) {
    const result = await (instance as any)[hook]();
    if (result instanceof Response) {
      return result;
    }
  }
}
