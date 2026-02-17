import 'reflect-metadata';
import { Response } from './response';

const BEFORE_HOOKS_KEY = 'action:before-hooks';

export function Before(): MethodDecorator {
  return (target, propertyKey) => {
    const hooks: string[] =
      Reflect.getOwnMetadata(BEFORE_HOOKS_KEY, target) || [];
    hooks.push(propertyKey as string);
    Reflect.defineMetadata(BEFORE_HOOKS_KEY, hooks, target);
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
