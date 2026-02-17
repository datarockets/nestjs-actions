import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';

export abstract class BaseAction {
  request: Request;
  response: ExpressResponse;
  moduleRef: ModuleRef;

  get headers() {
    return this.request.headers;
  }

  get params(): Record<string, any> {
    return this.request.params;
  }

  get body() {
    return this.request.body;
  }

  abstract exec(): Promise<any> | any;
}
