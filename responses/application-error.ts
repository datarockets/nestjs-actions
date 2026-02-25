import { z } from 'zod';
import { Response } from '../core/response';

export class ApplicationError extends Response {
  static readonly Schema = z
    .object({
      code: z.literal('application-error'),
    })
    .meta({ id: 'errors.ApplicationError' });

  declare readonly status: 500;
  declare readonly body: z.input<typeof ApplicationError.Schema>;

  constructor() {
    super({
      status: 500,
      body: {
        code: 'application-error',
      },
    });
  }
}
