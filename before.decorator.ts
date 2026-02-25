import 'reflect-metadata';
import { z } from 'zod';
import { Response } from './response';

const BEFORE_HOOKS_KEY = 'action:before-hooks';
const BEFORE_HOOK_OPENAPI_RESPONSES_KEY =
  'action:before-hook:openapi:responses';
const BEFORE_HOOK_OPENAPI_SECURITY_KEY = 'action:before-hook:openapi:security';

export type SecurityRequirement = Record<string, string[]>;

export interface BeforeOptions {
  openapi?: {
    responses?: Record<number, z.ZodType>;
    security?: SecurityRequirement[];
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

    Reflect.defineMetadata(
      BEFORE_HOOK_OPENAPI_SECURITY_KEY,
      options?.openapi?.security,
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

export function getBeforeHookSecurity(
  instance: object,
): SecurityRequirement[] | undefined {
  const chain: (SecurityRequirement[] | undefined)[] = [];
  let proto = Object.getPrototypeOf(instance);

  while (proto && proto !== Object.prototype) {
    const hooks: string[] =
      Reflect.getOwnMetadata(BEFORE_HOOKS_KEY, proto) || [];

    for (const hook of hooks) {
      const hookSecurity = Reflect.getOwnMetadata(
        BEFORE_HOOK_OPENAPI_SECURITY_KEY,
        proto,
        hook,
      ) as SecurityRequirement[] | undefined;
      if (hookSecurity) {
        chain.unshift(hookSecurity);
      }
    }

    proto = Object.getPrototypeOf(proto);
  }

  return chain.length > 0 ? chain[chain.length - 1] : undefined;
}

export async function runBeforeHooks(
  instance: object,
): Promise<Response | void> {
  const hooks = getBeforeHooks(instance);
  const callableInstance = instance as Record<string, () => unknown>;

  for (const hook of hooks) {
    const result = await callableInstance[hook]();
    if (result instanceof Response) {
      return result;
    }
  }
}
