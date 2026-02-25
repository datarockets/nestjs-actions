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
    return undefined;
  }

  return components;
}
