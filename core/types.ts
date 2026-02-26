import { z } from 'zod';
import { BaseAction } from './base-action';

export type ActionMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'SSE';
export type SecurityRequirement = Record<string, string[]>;
export type OpenApiResponses = Record<number, z.ZodType>;

export interface ActionOptions {
  method?: ActionMethod;
  path?: string;
  abstract?: boolean;
  sse?: {
    heartbeatInterval?: number;
  };
  openapi?: {
    responses?: OpenApiResponses;
    security?: SecurityRequirement[];
  };
}

export interface ActionMeta {
  method: ActionMethod;
  path: string;
  abstract: boolean;
  sse?: {
    heartbeatInterval?: number;
  };
  openapi?: {
    responses?: OpenApiResponses;
    security?: SecurityRequirement[];
  };
}

export interface BeforeOptions {
  openapi?: {
    responses?: OpenApiResponses;
    security?: SecurityRequirement[];
  };
}

export type ActionClass = new () => BaseAction;
