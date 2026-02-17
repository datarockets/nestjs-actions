import { Response } from '../response';

export class ApplicationError extends Response {
  declare readonly status: 500;
  declare readonly body: {
    code: 'application-error';
  };

  constructor() {
    super({
      status: 500,
      body: {
        code: 'application-error',
      },
    });
  }
}
