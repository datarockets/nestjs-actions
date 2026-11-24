import { Response } from '../core/response';

export class Created extends Response {
  declare readonly status: 201;
  declare readonly body: unknown;

  constructor(body?: unknown) {
    super({
      status: 201,
      body,
    });
  }
}
