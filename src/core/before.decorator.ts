import 'reflect-metadata';
import { z } from 'zod';
import { Response } from './response';
import { BeforeOptions, SecurityRequirement } from './types';

const BEFORE_HOOKS_KEY = 'action:before-hooks';
const BEFORE_HOOK_OPENAPI_RESPONSES_KEY =
  'action:before-hook:openapi:responses';
const BEFORE_HOOK_OPENAPI_SECURITY_KEY = 'action:before-hook:openapi:security';

/**
 * Method decorator that marks a method as a before hook.
 * Before hooks run in parent-first order before `exec()`.
 * Optionally attaches OpenAPI response and security metadata to the hook.
 */
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

/**
 * Collects OpenAPI response schemas from all `@Before()` hooks in the prototype chain.
 * Unlike security, responses use "collect all" semantics -- every hook's responses
 * are merged into the final operation spec.
 */
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

/**
 * Resolves the OpenAPI security requirement for the instance's before hooks.
 * Uses "first wins" semantics: returns the security from the first hook
 * (in parent-first order) that declares one, ignoring the rest.
 */
export function getBeforeHookSecurity(
  instance: object,
): SecurityRequirement[] | undefined {
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
        return hookSecurity;
      }
    }

    proto = Object.getPrototypeOf(proto);
  }

  return undefined;
}

/**
 * Executes all `@Before()` hooks on the action instance in parent-first order.
 * If any hook returns a {@link Response}, execution short-circuits and that
 * response is returned immediately -- `exec()` will not be called.
 * Returns `void` when all hooks pass.
 */
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
