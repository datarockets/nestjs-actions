import { Response } from '../response';

export class NotFoundError extends Response {
  declare readonly status: 404;
  declare readonly body: {
    code: 'not-found';
    message?: string;
  };

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
