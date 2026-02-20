import 'reflect-metadata';
import { z } from 'zod';

const ACTION_METHOD_KEY = 'action:method';
const ACTION_PATH_KEY = 'action:path';
const ACTION_ABSTRACT_KEY = 'action:abstract';
const ACTION_OPENAPI_RESPONSES_KEY = 'action:openapi:responses';

export type OpenApiResponses = Record<number, z.ZodType>;

export interface ActionOptions {
  method?: string;
  path?: string;
  abstract?: boolean;
  openapi?: {
    responses?: OpenApiResponses;
  };
}

export interface ActionMeta {
  method: string;
  path: string;
  abstract: boolean;
  openapi?: {
    responses?: OpenApiResponses;
  };
}

const MEMOIZED_GETTERS = ['params', 'query', 'body'];

export function Action(options: ActionOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(ACTION_METHOD_KEY, options.method || 'GET', target);
    Reflect.defineMetadata(ACTION_PATH_KEY, options.path || '', target);
    Reflect.defineMetadata(
      ACTION_ABSTRACT_KEY,
      options.abstract || false,
      target,
    );
    Reflect.defineMetadata(
      ACTION_OPENAPI_RESPONSES_KEY,
      options.openapi?.responses,
      target,
    );

    const proto = target.prototype;
    for (const key of MEMOIZED_GETTERS) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc?.get) {
        const original = desc.get;
        const cacheKey = Symbol(`memoized:${key}`);
        Object.defineProperty(proto, key, {
          ...desc,
          get() {
            if (!(cacheKey in this)) this[cacheKey] = original.call(this);
            return this[cacheKey];
          },
        });
      }
    }
  };
}

export function getActionMeta(target: Function): ActionMeta {
  return {
    method: (Reflect.getMetadata(ACTION_METHOD_KEY, target) as string) || 'GET',
    path: (Reflect.getMetadata(ACTION_PATH_KEY, target) as string) || '',
    abstract:
      (Reflect.getMetadata(ACTION_ABSTRACT_KEY, target) as boolean) || false,
    openapi: {
      responses: Reflect.getMetadata(ACTION_OPENAPI_RESPONSES_KEY, target) as
        | OpenApiResponses
        | undefined,
    },
  };
}

export function isActionClass(value: unknown): boolean {
  return (
    typeof value === 'function' && Reflect.hasMetadata(ACTION_METHOD_KEY, value)
  );
}
