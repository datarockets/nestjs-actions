import { Response } from '../response';
import { ApplicationError } from './application-error';
import { z } from 'zod';

export class Ok<S extends z.ZodType> extends Response {
  declare readonly status: 200;
  declare readonly body: z.input<S>;

  static render<S extends z.ZodType, D extends z.output<S>>(
    schema: S,
    data: D,
  ) {
    try {
      return new Ok(schema.encode(data as z.output<S>));
    } catch (e) {
      return new ApplicationError();
    }
  }

  constructor(body?: z.input<S>) {
    super({
      status: 200,
      body,
    });
  }
}
