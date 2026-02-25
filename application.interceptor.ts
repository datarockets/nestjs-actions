import { CallHandler, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from './core/response';

@Injectable()
export class ApplicationInterceptor {
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
