import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';

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
