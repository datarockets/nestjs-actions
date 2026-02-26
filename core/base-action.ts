import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';

/**
 * Abstract base class for all action endpoints.
 *
 * The `request`, `response`, and `moduleRef` properties are assigned
 * post-construction by the runtime (see `executeActionRequest`).
 * The `params`, `query`, and `body` getters are passthrough defaults;
 * subclasses typically override them with parsing logic, and the
 * {@link Action} decorator memoizes the overridden getters automatically.
 */
export abstract class BaseAction {
  request: Request;
  response: ExpressResponse;
  moduleRef: ModuleRef;

  get headers() {
    return this.request.headers;
  }

  get params(): Request['params'] {
    return this.request.params;
  }

  get query(): Request['query'] {
    return this.request.query;
  }

  get body() {
    return this.request.body;
  }

  abstract exec(): Promise<unknown> | unknown;
}
