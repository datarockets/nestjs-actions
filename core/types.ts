import { z } from 'zod';
import { BaseAction } from './base-action';

export type SecurityRequirement = Record<string, string[]>;
export type OpenApiResponses = Record<number, z.ZodType>;

export interface ActionOptions {
  method?: string;
  path?: string;
  abstract?: boolean;
  openapi?: {
    responses?: OpenApiResponses;
    security?: SecurityRequirement[];
  };
}

export interface ActionMeta {
  method: string;
  path: string;
  abstract: boolean;
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
