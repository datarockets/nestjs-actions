import { SpecRequestBody } from './types';
import { ActionClass, convertSchema, withSchemas } from './schema';

export function operationRequestBody(
  actionClass: ActionClass,
  isSse: boolean,
): {
  requestBody?: SpecRequestBody;
  referencedSchemaIds: string[];
} {
  if (isSse) return { referencedSchemaIds: [] };

  const requestSchema = withSchemas(actionClass).Request;
  if (!requestSchema) return { referencedSchemaIds: [] };

  const schemaSpec = convertSchema(requestSchema);

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
