import { Response } from '../response';

export class Created extends Response {
  declare readonly status: 201;
  declare readonly body: any;

  constructor(body?: any) {
    super({
      status: 201,
      body,
    });
  }
}
