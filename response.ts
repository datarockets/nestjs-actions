export class Response {
  readonly status: number;
  readonly body: unknown;

  constructor(options: { status: number; body?: unknown }) {
    this.status = options.status;
    this.body = options.body;
  }
}
