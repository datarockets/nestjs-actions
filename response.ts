export class Response {
  readonly status: number;
  readonly body: any;

  constructor(options: { status: number; body?: any }) {
    this.status = options.status;
    this.body = options.body;
  }
}
