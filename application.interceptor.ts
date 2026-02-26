import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from './core/response';

/**
 * Global NestJS interceptor that applies the status code from a {@link Response}
 * value object to the underlying Express response. This allows action handlers
 * to control the HTTP status by returning a `Response` instead of calling
 * `res.status()` directly.
 */
@Injectable()
export class ApplicationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap((returned) => {
        if (returned instanceof Response) {
          response.status(returned.status);
        }
      }),
    );
  }
}
