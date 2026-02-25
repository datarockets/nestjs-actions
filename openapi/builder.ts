import { buildComponents } from './components';
import { pathParameters, queryParameters } from './operation.parameters';
import { operationRequestBody } from './operation.request-body';
import { operationResponses } from './operation.responses';
import { operationSecurity } from './operation.security';
import {
  Spec,
  SpecEntry,
  SpecOptions,
  SpecParameter,
  SpecPathOperation,
  SpecPaths,
} from './types';

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

  const components = buildComponents(usedSchemaIds, options);
  if (!components) {
    return { paths };
  }

  return { paths, components };
}
