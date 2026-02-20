import { z } from 'zod';
import { Response } from '../response';

export class NotFoundError extends Response {
  static readonly Schema = z
    .object({
      code: z.literal('not-found'),
      message: z.string().optional(),
    })
    .meta({ id: 'errors.NotFoundError' });

  declare readonly status: 404;
  declare readonly body: z.input<typeof NotFoundError.Schema>;

  constructor(message?: string) {
    super({
      status: 404,
      body: {
        code: 'not-found',
        message,
      },
    });
  }
}
