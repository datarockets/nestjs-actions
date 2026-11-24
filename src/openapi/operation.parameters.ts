import { SpecPathParameter, SpecQueryParameter } from './types';
import { ActionClass, objectJsonSchema, withSchemas } from './schema';

export function pathParameters(
  openApiPath: string,
  actionClass: ActionClass,
): SpecPathParameter[] {
  const paramNames = [...openApiPath.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (paramNames.length === 0) return [];

  const paramsSchema = withSchemas(actionClass).Params;
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

export function queryParameters(
  actionClass: ActionClass,
): SpecQueryParameter[] {
  const querySchema = withSchemas(actionClass).Query;
  if (!querySchema) return [];

  const { properties = {}, required = [] } = objectJsonSchema(querySchema);

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query' as const,
    required: required.includes(name),
    schema: { ...(schema as Record<string, unknown>) },
  }));
}
