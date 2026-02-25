export type ActionModule = Record<string, unknown>;

export interface RouteOptions {
  to: ActionModule;
}

export interface ResourcesOptions {
  to?: ActionModule;
  param?: string;
}

export interface RouteNode {
  type: 'path' | 'resources';
  path: string;
  param?: string;
  module?: ActionModule;
  children?: RouteNode[];
}
