import { z } from 'zod';
import { Response } from '../response';

export class BadRequestError extends Response {
  static readonly Schema = z
    .object({
      code: z.literal('bad-request'),
      message: z.string().optional(),
    })
    .meta({ id: 'errors.BadRequestError' });

  declare readonly status: 400;
  declare readonly body: z.input<typeof BadRequestError.Schema>;

  constructor(message?: string) {
    super({
      status: 400,
      body: {
        code: 'bad-request',
        message,
      } as BadRequestError['body'],
    });
  }
}
