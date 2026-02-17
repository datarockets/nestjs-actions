import { z } from 'zod';
import { Response } from '../response';

export class InputError extends Response {
  declare readonly status: 422;
  declare readonly body: {
    code: 'input-error';
    details: any;
  };

  constructor(error: z.ZodError) {
    super({
      status: 422,
      body: { code: 'input-error', details: z.treeifyError(error) },
    });
  }
}
