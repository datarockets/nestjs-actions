import { z } from 'zod';
import { BaseAction } from '../core/base-action';

export type ActionClass = new () => BaseAction;

export type ActionClassWithSchemas = ActionClass & {
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

export interface ConvertedSchema {
  schema: Record<string, unknown>;
  description?: string;
  referencedIds: string[];
}

export function withSchemas(actionClass: ActionClass): ActionClassWithSchemas {
  return actionClass as ActionClassWithSchemas;
}

export function objectJsonSchema(schema: z.ZodType): ObjectJsonSchema {
  return z.toJSONSchema(schema, { io: 'input' }) as ObjectJsonSchema;
}

export function convertSchema(schema: z.ZodType): ConvertedSchema {
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

export function hasValidationSchemas(actionClass: ActionClass): boolean {
  return (
    'Params' in actionClass ||
    'Query' in actionClass ||
    'Request' in actionClass
  );
}
