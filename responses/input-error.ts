import { z } from 'zod';
import { Response } from '../response';

export class InputError extends Response {
  static readonly Schema = z
    .object({
      code: z.literal('input-error'),
      details: z.array(
        z.object({
          code: z.string(),
          message: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
        }),
      ),
    })
    .meta({ id: 'errors.InputError' });

  declare readonly status: 422;
  declare readonly body: z.input<typeof InputError.Schema>;

  constructor(error: z.ZodError) {
    super({
      status: 422,
      body: { code: 'input-error', details: error.issues },
    });
  }
}
