import { BaseAction } from '../core/base-action';
import { SecurityRequirement } from '../core/types';

export interface SpecPathParameter {
  name: string;
  in: 'path';
  required: true;
  schema: Record<string, unknown>;
}

export interface SpecQueryParameter {
  name: string;
  in: 'query';
  required: boolean;
  schema: Record<string, unknown>;
}

export type SpecParameter = SpecPathParameter | SpecQueryParameter;

export interface SpecMediaType {
  schema: Record<string, unknown>;
  itemSchema?: Record<string, unknown>;
}

export interface SpecResponse {
  description?: string;
  content?: Record<string, SpecMediaType>;
}

export interface SpecRequestBody {
  content: Record<string, { schema: Record<string, unknown> }>;
  description?: string;
}

export interface SpecPathOperation {
  operationId: string;
  parameters?: SpecParameter[];
  requestBody?: SpecRequestBody;
  responses: Record<string, SpecResponse>;
  security?: SecurityRequirement[];
}

export type SpecPaths = Record<string, Record<string, SpecPathOperation>>;

export interface SpecComponents {
  schemas?: Record<string, Record<string, unknown>>;
  securitySchemes?: Record<string, Record<string, unknown>>;
}

export interface Spec {
  paths: SpecPaths;
  components?: SpecComponents;
}

export interface SpecEntry {
  path: string;
  method: string;
  operationId: string;
  actionClass: new () => BaseAction;
  isSse: boolean;
}

export interface SpecOptions {
  prefix?: string;
  securitySchemes?: Record<string, Record<string, unknown>>;
}
