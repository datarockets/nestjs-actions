import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Sse,
  Req,
  Res,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import { z } from 'zod';
import {
  getActionMeta,
  isActionClass,
  ActionMeta,
  OpenApiResponses,
} from './action.decorator';
import { BaseAction } from './base-action';
import { Response } from './response';
import { getBeforeHookResponses, runBeforeHooks } from './before.decorator';
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
  const isSse = meta.method.toUpperCase() === 'SSE';

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

    handleSse(req: Request) {
      const action = new ActionClass();
      action.request = req;
      action.moduleRef = this.moduleRef;

      return action.exec();
    }
  }

  const routeName = routeNameFromPath(basePath);
  const handlerName = isSse ? 'handleSse' : 'handle';
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
    Sse(meta.path || undefined)(
      ActionController.prototype,
      handlerName,
      descriptor,
    );
    Req()(ActionController.prototype, handlerName, 0);
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

interface SpecPathParameter {
  name: string;
  in: 'path';
  required: true;
  schema: Record<string, unknown>;
}

interface SpecQueryParameter {
  name: string;
  in: 'query';
  required: boolean;
  schema: Record<string, unknown>;
}

type SpecParameter = SpecPathParameter | SpecQueryParameter;

interface SpecMediaType {
  schema: Record<string, unknown>;
}

interface SpecResponse {
  description?: string;
  content?: {
    'application/json': SpecMediaType;
  };
}

interface SpecPathOperation {
  operationId: string;
  parameters?: SpecParameter[];
  responses: Record<string, SpecResponse>;
}

type SpecPaths = Record<string, Record<string, SpecPathOperation>>;

interface SpecComponents {
  schemas: Record<string, Record<string, unknown>>;
}

export interface Spec {
  paths: SpecPaths;
  components?: SpecComponents;
}

function responseSchema(schema: z.ZodType): {
  schema: Record<string, unknown>;
  description?: string;
  referencedIds: string[];
} {
  const meta = z.globalRegistry.get(schema) as
    | { id?: string; description?: string }
    | undefined;

  if (meta?.id) {
    return {
      schema: {
        $ref: `#/components/schemas/${meta.id}`,
      },
      description: meta.description,
      referencedIds: [meta.id],
    };
  }

  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
  }) as Record<string, unknown>;

  const referencedIds: string[] = [];
  const defs = jsonSchema['$defs'] as Record<string, unknown> | undefined;
  if (defs) {
    referencedIds.push(...Object.keys(defs));
    delete jsonSchema['$defs'];
  }
  delete jsonSchema['openapi'];
  delete jsonSchema['$schema'];
  delete jsonSchema['description'];

  const raw = JSON.stringify(jsonSchema);
  const fixed = raw.replace(/#\/\$defs\//g, '#/components/schemas/');

  return {
    schema: JSON.parse(fixed) as Record<string, unknown>,
    description: meta?.description,
    referencedIds,
  };
}

function operationResponses(actionClass: new () => BaseAction): {
  responses: Record<string, SpecResponse>;
  referencedSchemaIds: string[];
} {
  const action = new actionClass();
  const beforeResponses = getBeforeHookResponses(action);
  const actionResponses = getActionMeta(actionClass).openapi?.responses;

  const staticResponseSchema = (actionClass as any).Response as
    | z.ZodType
    | undefined;
  let staticResponse: OpenApiResponses | undefined;
  if (staticResponseSchema) {
    const meta = z.globalRegistry.get(staticResponseSchema) as
      | { openapi?: { response?: { status?: number } } }
      | undefined;
    const status = meta?.openapi?.response?.status ?? 200;
    staticResponse = { [status]: staticResponseSchema };
  }

  const mergedResponses = [
    ...beforeResponses,
    ...(actionResponses ? [actionResponses] : []),
    ...(staticResponse ? [staticResponse] : []),
  ].reduce(
    (acc, responses) => ({ ...acc, ...responses }),
    {} as OpenApiResponses,
  );

  const entries = Object.entries(mergedResponses);
  if (entries.length === 0) {
    return {
      responses: {},
      referencedSchemaIds: [],
    };
  }

  const referencedSchemaIds: string[] = [];
  const responses: Record<string, SpecResponse> = {};
  for (const [status, schema] of entries) {
    const schemaSpec = responseSchema(schema);
    referencedSchemaIds.push(...schemaSpec.referencedIds);

    const response: SpecResponse = {
      content: {
        'application/json': {
          schema: schemaSpec.schema,
        },
      },
    };

    if (schemaSpec.description) {
      response.description = schemaSpec.description;
    }

    responses[status] = response;
  }

  return {
    responses,
    referencedSchemaIds,
  };
}

function pathParameters(
  openApiPath: string,
  ActionClass: new () => BaseAction,
): SpecPathParameter[] {
  const paramNames = [...openApiPath.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (paramNames.length === 0) return [];

  const paramsSchema = (ActionClass as any).Params;
  let schemasByName: Record<string, Record<string, unknown>> = {};

  if (paramsSchema) {
    const jsonSchema = z.toJSONSchema(paramsSchema, { io: 'input' });
    const properties = (jsonSchema as Record<string, any>).properties || {};
    schemasByName = properties;
  }

  return paramNames.map((name) => {
    const schema = schemasByName[name];
    return {
      name,
      in: 'path' as const,
      required: true as const,
      schema: schema ? { ...schema } : { type: 'string' },
    };
  });
}

function queryParameters(
  ActionClass: new () => BaseAction,
): SpecQueryParameter[] {
  const querySchema = (ActionClass as any).Query;
  if (!querySchema) return [];

  const jsonSchema = z.toJSONSchema(querySchema, { io: 'input' });
  const properties = (jsonSchema as Record<string, any>).properties || {};
  const required: string[] = (jsonSchema as Record<string, any>).required || [];

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query' as const,
    required: required.includes(name),
    schema: { ...(schema as Record<string, unknown>) },
  }));
}

function create(routes: RouteNode[], actionsMap?: ActionModule) {
  const controllers: any[] = [];
  const specEntries: {
    path: string;
    method: string;
    operationId: string;
    actionClass: new () => BaseAction;
  }[] = [];

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
            method:
              meta.method.toUpperCase() === 'SSE'
                ? 'get'
                : meta.method.toLowerCase(),
            operationId,
            actionClass: ActionClass,
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
      const usedSchemaIds = new Set<string>();
      for (const entry of specEntries) {
        const path = prefix ? `${prefix}${entry.path}` : entry.path;
        if (!paths[path]) paths[path] = {};
        const specResponses = operationResponses(entry.actionClass);
        for (const schemaId of specResponses.referencedSchemaIds) {
          usedSchemaIds.add(schemaId);
        }
        const operation: SpecPathOperation = {
          operationId: entry.operationId,
          responses: specResponses.responses,
        };
        const params: SpecParameter[] = [
          ...pathParameters(path, entry.actionClass),
          ...queryParameters(entry.actionClass),
        ];
        if (params.length > 0) {
          operation.parameters = params;
        }
        paths[path][entry.method] = operation;
      }

      if (usedSchemaIds.size === 0) {
        return { paths };
      }

      const globalSchemas = (
        z.toJSONSchema(z.globalRegistry, {
          io: 'input',
        }) as { schemas?: Record<string, Record<string, unknown>> }
      ).schemas;

      const schemas: Record<string, Record<string, unknown>> = {};
      for (const schemaId of usedSchemaIds) {
        const schema = globalSchemas?.[schemaId];
        if (schema) {
          schemas[schemaId] = schema;
        }
      }

      if (Object.keys(schemas).length === 0) {
        return { paths };
      }

      return {
        paths,
        components: {
          schemas,
        },
      };
    },
  };
}

export const router = {
  create,
  path: routePath,
  resources: routeResources,
};
