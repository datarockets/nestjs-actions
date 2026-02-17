import { Response } from '../response';

export class BadRequestError extends Response {
  declare readonly status: 400;
  declare readonly body: {
    code: 'bad-request';
    message?: string;
  };

  constructor(message?: string) {
    super({
      status: 400,
      body: {
        code: 'bad-request',
        message,
      },
    });
  }
}
