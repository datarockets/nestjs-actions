import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { InputError } from './responses/input-error';

/**
 * Global NestJS exception filter for action endpoints.
 * Converts `ZodError` into a 422 `InputError` response with structured
 * validation details. Other `HttpException` types are mapped to their
 * status code; unrecognized errors produce a 500 with logging.
 */
@Catch()
export class ApplicationFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApplicationFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof z.ZodError) {
      const inputError = new InputError(exception);
      response.status(inputError.status).json(inputError.body);
      return;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    if (status === 500) {
      this.logger.error(exception);
    }

    const code = STATUS_CODES[status] || 'application-error';

    response.status(status).json({ code });
  }
}

const STATUS_CODES: Record<number, string> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  422: 'input-error',
  500: 'application-error',
};
