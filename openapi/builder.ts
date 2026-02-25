import { z } from 'zod';
import { getActionMeta } from '../core/action.decorator';
import {
  getBeforeHookResponses,
  getBeforeHookSecurity,
} from '../core/before.decorator';
import { BaseAction } from '../core/base-action';
import { OpenApiResponses } from '../core/types';
import { InputError } from '../responses/input-error';
import {
  Spec,
  SpecComponents,
  SpecEntry,
  SpecOptions,
  SpecParameter,
  SpecPathParameter,
  SpecPathOperation,
  SpecPaths,
  SpecQueryParameter,
  SpecRequestBody,
  SpecResponse,
} from './types';

type ActionClassWithSchemas = (new () => BaseAction) & {
  Params?: z.ZodType;
  Query?: z.ZodType;
  Request?: z.ZodType;
  Response?: z.ZodType;
  ResponseItem?: z.ZodType;
};

interface ObjectJsonSchema {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
}

function withSchemas(
  actionClass: new () => BaseAction,
): ActionClassWithSchemas {
  return actionClass as ActionClassWithSchemas;
}

function objectJsonSchema(schema: z.ZodType): ObjectJsonSchema {
  return z.toJSONSchema(schema, { io: 'input' }) as ObjectJsonSchema;
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

function operationResponses(
  actionClass: new () => BaseAction,
  isSse: boolean,
): {
  responses: Record<string, SpecResponse>;
  referencedSchemaIds: string[];
} {
  const action = new actionClass();
  const actionWithSchemas = withSchemas(actionClass);
  const beforeResponses = getBeforeHookResponses(action);
  const actionResponses = getActionMeta(actionClass).openapi?.responses;

  let staticResponse: OpenApiResponses | undefined;

  if (isSse) {
    const responseItemSchema = actionWithSchemas.ResponseItem;

    if (responseItemSchema) {
      const itemSchemaSpec = responseSchema(responseItemSchema);
      const referencedSchemaIds: string[] = [...itemSchemaSpec.referencedIds];

      const mergedResponses = [
        ...beforeResponses,
        ...(actionResponses ? [actionResponses] : []),
      ].reduce(
        (acc, responses) => ({ ...acc, ...responses }),
        {} as OpenApiResponses,
      );

      if (hasValidationSchemas(actionClass) && !('422' in mergedResponses)) {
        mergedResponses['422'] = InputError.Schema;
      }

      const responses: Record<string, SpecResponse> = {};

      for (const [status, schema] of Object.entries(mergedResponses)) {
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

      const sseResponse: SpecResponse = {
        content: {
          'text/event-stream': {
            schema: { type: 'string' },
            itemSchema: itemSchemaSpec.schema,
          },
        },
      };

      if (itemSchemaSpec.description) {
        sseResponse.description = itemSchemaSpec.description;
      }

      responses['200'] = sseResponse;

      return { responses, referencedSchemaIds };
    }
  } else {
    const staticResponseSchema = actionWithSchemas.Response;

    if (staticResponseSchema) {
      const meta = z.globalRegistry.get(staticResponseSchema) as
        | { openapi?: { response?: { status?: number } } }
        | undefined;
      const status = meta?.openapi?.response?.status ?? 200;
      staticResponse = { [status]: staticResponseSchema };
    }
  }

  const mergedResponses = [
    ...beforeResponses,
    ...(actionResponses ? [actionResponses] : []),
    ...(staticResponse ? [staticResponse] : []),
  ].reduce(
    (acc, responses) => ({ ...acc, ...responses }),
    {} as OpenApiResponses,
  );

  if (hasValidationSchemas(actionClass) && !('422' in mergedResponses)) {
    mergedResponses['422'] = InputError.Schema;
  }

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

function operationSecurity(actionClass: new () => BaseAction) {
  const action = new actionClass();
  const actionMeta = getActionMeta(actionClass);

  if (actionMeta.openapi?.security) {
    return actionMeta.openapi.security;
  }

  return getBeforeHookSecurity(action);
}

function hasValidationSchemas(actionClass: new () => BaseAction): boolean {
  return (
    'Params' in actionClass ||
    'Query' in actionClass ||
    'Request' in actionClass
  );
}

function pathParameters(
  openApiPath: string,
  ActionClass: new () => BaseAction,
): SpecPathParameter[] {
  const paramNames = [...openApiPath.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (paramNames.length === 0) return [];

  const paramsSchema = withSchemas(ActionClass).Params;
  let schemasByName: Record<string, Record<string, unknown>> = {};

  if (paramsSchema) {
    const { properties } = objectJsonSchema(paramsSchema);
    schemasByName = properties ?? {};
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
  const querySchema = withSchemas(ActionClass).Query;
  if (!querySchema) return [];

  const { properties = {}, required = [] } = objectJsonSchema(querySchema);

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query' as const,
    required: required.includes(name),
    schema: { ...(schema as Record<string, unknown>) },
  }));
}

function operationRequestBody(
  actionClass: new () => BaseAction,
  isSse: boolean,
): {
  requestBody?: SpecRequestBody;
  referencedSchemaIds: string[];
} {
  if (isSse) return { referencedSchemaIds: [] };

  const requestSchema = withSchemas(actionClass).Request;
  if (!requestSchema) return { referencedSchemaIds: [] };

  const schemaSpec = responseSchema(requestSchema);

  const body: SpecRequestBody = {
    content: {
      'application/json': {
        schema: schemaSpec.schema,
      },
    },
  };

  if (schemaSpec.description) {
    body.description = schemaSpec.description;
  }

  return {
    requestBody: body,
    referencedSchemaIds: schemaSpec.referencedIds,
  };
}

export function buildSpec(
  specEntries: SpecEntry[],
  options?: SpecOptions,
): Spec {
  const prefix = options?.prefix || '';
  const paths: SpecPaths = {};
  const usedSchemaIds = new Set<string>();
  for (const entry of specEntries) {
    const path = prefix ? `${prefix}${entry.path}` : entry.path;
    if (!paths[path]) paths[path] = {};
    const specResponses = operationResponses(entry.actionClass, entry.isSse);
    for (const schemaId of specResponses.referencedSchemaIds) {
      usedSchemaIds.add(schemaId);
    }
    const specRequestBody = operationRequestBody(
      entry.actionClass,
      entry.isSse,
    );
    for (const schemaId of specRequestBody.referencedSchemaIds) {
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
    if (specRequestBody.requestBody) {
      operation.requestBody = specRequestBody.requestBody;
    }
    const security = operationSecurity(entry.actionClass);
    if (security) {
      operation.security = security;
    }
    paths[path][entry.method] = operation;
  }

  const components: SpecComponents = {};

  if (options?.securitySchemes) {
    components.securitySchemes = options.securitySchemes;
  }

  const globalSchemas = (
    z.toJSONSchema(z.globalRegistry, {
      io: 'input',
    }) as { schemas?: Record<string, Record<string, unknown>> }
  ).schemas;

  const schemas: Record<string, Record<string, unknown>> = {};
  const queue = [...usedSchemaIds];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const schemaId = queue.pop()!;
    if (visited.has(schemaId)) continue;
    visited.add(schemaId);

    const schema = globalSchemas?.[schemaId];
    if (!schema) continue;
    schemas[schemaId] = schema;

    const raw = JSON.stringify(schema);
    const refPattern = /"\$ref"\s*:\s*"([^"#][^"]*)"/g;
    let match;
    while ((match = refPattern.exec(raw)) !== null) {
      queue.push(match[1]);
    }
  }

  for (const [id, schema] of Object.entries(schemas)) {
    const raw = JSON.stringify(schema);
    const fixed = raw.replace(
      /"\$ref"\s*:\s*"([^"#][^"]*)"/g,
      '"$ref":"#/components/schemas/$1"',
    );
    const parsed = JSON.parse(fixed) as Record<string, unknown>;
    delete parsed['$schema'];
    delete parsed['id'];
    schemas[id] = parsed;
  }

  if (Object.keys(schemas).length > 0) {
    components.schemas = schemas;
  }

  if (Object.keys(components).length === 0) {
    return { paths };
  }

  return { paths, components };
}
