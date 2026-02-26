import { HttpException, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { runBeforeHooks } from '../core/before.decorator';
import { Response } from '../core/response';
import type { ActionClass } from '../core/types';

const logger = new Logger('SseStream');

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

const STATUS_CODES: Record<number, string> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  422: 'input-error',
  500: 'application-error',
};

/**
 * Executes the full request lifecycle for an action:
 * 1. Instantiates the action and injects `request`, `response`, `moduleRef`.
 * 2. Runs `@Before()` hooks -- short-circuits if any returns a `Response`.
 * 3. Calls `exec()` and handles the result: `Response` objects set the status,
 *    async iterables are streamed as SSE, plain values are returned to NestJS.
 */
export async function executeActionRequest(
  ActionClass: ActionClass,
  moduleRef: ModuleRef,
  req: Request,
  res: ExpressResponse,
  options?: { isSse?: boolean; heartbeatIntervalMs?: number },
) {
  const isSse = options?.isSse ?? false;

  const action = new ActionClass();
  action.request = req;
  action.response = res;
  action.moduleRef = moduleRef;

  const beforeResult = await runBeforeHooks(action);
  if (beforeResult instanceof Response) {
    return resolveResponse(beforeResult, res, isSse);
  }

  const result = await action.exec();
  if (result instanceof Response) {
    return resolveResponse(result, res, isSse);
  }

  if (isSse && isAsyncIterable(result)) {
    await streamSseResponse(result, req, res, options?.heartbeatIntervalMs);
    return;
  }

  return result;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  const iterableLike = value as { [Symbol.asyncIterator]?: unknown } | null;
  return (
    iterableLike != null &&
    typeof iterableLike[Symbol.asyncIterator] === 'function'
  );
}

function resolveResponse(
  response: Response,
  res: ExpressResponse,
  isSse: boolean,
) {
  res.status(response.status);

  if (!isSse) {
    return response.body;
  }

  const body = response.body ?? toErrorBody(response.status);
  res.json(body);
}

function toErrorBody(status: number): { code: string } | undefined {
  const code = STATUS_CODES[status];
  return code ? { code } : undefined;
}

const SSE_HEARTBEAT = ':heartbeat\n\n';

async function streamSseResponse(
  iterable: AsyncIterable<unknown>,
  req: Request,
  res: ExpressResponse,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader(
    'Cache-Control',
    'private, no-cache, no-store, must-revalidate',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders();

  const iterator = iterable[Symbol.asyncIterator]();
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  };

  req.on('close', () => {
    cleanup();
    iterator.return?.(undefined);
    if (!res.writableEnded) {
      res.end();
    }
  });

  heartbeatTimer = setInterval(() => {
    if (!res.writableEnded) {
      res.write(SSE_HEARTBEAT);
    }
  }, heartbeatIntervalMs);

  try {
    for await (const event of { [Symbol.asyncIterator]: () => iterator }) {
      if (res.writableEnded) break;
      res.write(formatSseMessage(event));
    }
  } catch (error) {
    if (!res.writableEnded) {
      const code = sanitizeError(error);
      res.write(formatSseMessage({ event: 'error', data: code }));
    }
  }

  cleanup();

  if (!res.writableEnded) {
    res.end();
  }
}

function sanitizeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return 'input-error';
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 500) {
      logger.error(error);
    }
    return STATUS_CODES[status] || 'application-error';
  }

  logger.error(error);
  return 'application-error';
}

function formatSseMessage(event: unknown) {
  const chunks: string[] = [];
  const normalized =
    typeof event === 'object' && event !== null
      ? (event as Record<string, unknown>)
      : undefined;

  if (typeof normalized?.event === 'string') {
    chunks.push(`event: ${normalized.event}`);
  }

  if (normalized?.id !== undefined) {
    chunks.push(`id: ${String(normalized.id)}`);
  }

  const data = normalized && 'data' in normalized ? normalized.data : event;
  const encodedData =
    typeof data === 'string' ? data : JSON.stringify(data ?? null);

  for (const line of encodedData.split(/\r?\n/)) {
    chunks.push(`data: ${line}`);
  }

  return `${chunks.join('\n')}\n\n`;
}
