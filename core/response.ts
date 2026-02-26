/**
 * Immutable value object representing an HTTP response with a status code and optional body.
 * Return a `Response` (or a subclass like `Ok`, `Created`, etc.) from `exec()` or
 * a `@Before()` hook to control the status code and body sent to the client.
 */
export class Response {
  readonly status: number;
  readonly body: unknown;

  constructor(options: { status: number; body?: unknown }) {
    this.status = options.status;
    this.body = options.body;
  }
}
