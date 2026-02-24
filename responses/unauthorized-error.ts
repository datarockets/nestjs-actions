import { z } from 'zod';
import { Response } from '../response';

export class UnauthorizedError extends Response {
  static readonly Schema = z
    .object({
      code: z.literal('unauthorized'),
    })
    .meta({ id: 'errors.UnauthorizedError' });

  declare readonly status: 401;
  declare readonly body: z.input<typeof UnauthorizedError.Schema>;

  constructor() {
    super({
      status: 401,
      body: {
        code: 'unauthorized',
      } as UnauthorizedError['body'],
    });
  }
}
