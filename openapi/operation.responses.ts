import { z } from 'zod';
import { getActionMeta } from '../core/action.decorator';
import { getBeforeHookResponses } from '../core/before.decorator';
import { OpenApiResponses } from '../core/types';
import { InputError } from '../responses/input-error';
import { SpecResponse } from './types';
import {
  ActionClass,
  convertSchema,
  hasValidationSchemas,
  withSchemas,
} from './schema';

export function operationResponses(
  actionClass: ActionClass,
  isSse: boolean,
): {
  responses: Record<string, SpecResponse>;
  referencedSchemaIds: string[];
} {
  const action = new actionClass();
  const actionWithSchemas = withSchemas(actionClass);
  const beforeResponses = getBeforeHookResponses(action);
  const actionResponses = getActionMeta(actionClass).openapi?.responses;

  const responseItemSchema = isSse ? actionWithSchemas.ResponseItem : undefined;

  let staticResponse: OpenApiResponses | undefined;
  if (!isSse) {
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
  if (entries.length === 0 && !responseItemSchema) {
    return {
      responses: {},
      referencedSchemaIds: [],
    };
  }

  const referencedSchemaIds: string[] = [];
  const responses: Record<string, SpecResponse> = {};

  for (const [status, schema] of entries) {
    const schemaSpec = convertSchema(schema);
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

  if (responseItemSchema) {
    const itemSchemaSpec = convertSchema(responseItemSchema);
    referencedSchemaIds.push(...itemSchemaSpec.referencedIds);

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
  }

  return {
    responses,
    referencedSchemaIds,
  };
}
