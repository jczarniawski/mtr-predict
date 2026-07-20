/**
 * Standard Broker API v2 error body:
 * { status, title, detail, path, type?, timestamp } — match on `type` in code,
 * show `detail` to humans.
 */
export class BrokerApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly errorType?: string;
  readonly path?: string;

  constructor(opts: {
    status: number;
    title?: string;
    detail?: string;
    type?: string;
    path?: string;
  }) {
    super(opts.detail || opts.title || `Broker API error (HTTP ${opts.status})`);
    this.name = "BrokerApiError";
    this.status = opts.status;
    this.title = opts.title ?? "";
    this.detail = opts.detail ?? "";
    this.errorType = opts.type;
    this.path = opts.path;
  }

  get isAuth(): boolean {
    return this.status === 401;
  }

  get isPermission(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Message safe to surface to the end user. */
  get userMessage(): string {
    if (this.status === 401) return "The broker rejected our API token. Check the server configuration.";
    if (this.status === 403)
      return "The API token lacks permission for this operation (Prediction Market endpoints need a dedicated permission).";
    return this.detail || this.title || `Broker request failed (HTTP ${this.status}).`;
  }
}

export function isBrokerApiError(e: unknown): e is BrokerApiError {
  return e instanceof BrokerApiError;
}
