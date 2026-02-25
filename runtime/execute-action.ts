import { ModuleRef } from '@nestjs/core';
import { Request, Response as ExpressResponse } from 'express';
import { runBeforeHooks } from '../before.decorator';
import { BaseAction } from '../base-action';
import { Response } from '../response';

export type ActionClass = new () => BaseAction;

export async function executeActionRequest(
  ActionClass: ActionClass,
  moduleRef: ModuleRef,
  req: Request,
  res: ExpressResponse,
  options?: { isSse?: boolean },
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
    await streamSseResponse(result, req, res);
    return;
  }

  return result;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null && typeof (value as any)[Symbol.asyncIterator] === 'function'
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

  res.json(response.body ?? {});
}

async function streamSseResponse(
  iterable: AsyncIterable<unknown>,
  req: Request,
  res: ExpressResponse,
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader(
    'Cache-Control',
    'private, no-cache, no-store, must-revalidate',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expire', '0');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders();

  const iterator = iterable[Symbol.asyncIterator]();

  req.on('close', () => {
    iterator.return?.(undefined);
    if (!res.writableEnded) {
      res.end();
    }
  });

  try {
    for await (const event of { [Symbol.asyncIterator]: () => iterator }) {
      if (res.writableEnded) break;
      res.write(formatSseMessage(event));
    }
  } catch (error) {
    if (!res.writableEnded) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(formatSseMessage({ event: 'error', data: message }));
    }
  }

  if (!res.writableEnded) {
    res.end();
  }
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
