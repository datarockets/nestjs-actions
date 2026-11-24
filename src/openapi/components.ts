import { z } from 'zod';
import { SpecComponents, SpecOptions } from './types';

export function buildComponents(
  usedSchemaIds: Iterable<string>,
  options?: SpecOptions,
): SpecComponents | undefined {
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

    collectRefs(schema, queue);
  }

  for (const [id, schema] of Object.entries(schemas)) {
    rewriteRefs(schema);
    delete schema['$schema'];
    delete schema['id'];
  }

  if (Object.keys(schemas).length > 0) {
    components.schemas = schemas;
  }

  if (Object.keys(components).length === 0) {
    return undefined;
  }

  return components;
}

function collectRefs(obj: unknown, refs: string[]): void {
  if (typeof obj !== 'object' || obj === null) return;
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string' && !value.startsWith('#')) {
      refs.push(value);
    } else {
      collectRefs(value, refs);
    }
  }
}

function rewriteRefs(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string' && !value.startsWith('#')) {
      obj[key] = `#/components/schemas/${value}`;
    } else if (typeof value === 'object' && value !== null) {
      rewriteRefs(value as Record<string, unknown>);
    }
  }
}
