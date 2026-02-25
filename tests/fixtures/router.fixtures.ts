import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';

import { Action, BaseAction, Before, Response } from '../../index';
import type { ActionControllerClass } from '../../runtime/create-controller';

@Action({})
export class IndexAction extends BaseAction {
  async exec() {
    return { items: [] };
  }
}

@Action({ method: 'POST' })
export class CreateAction extends BaseAction {
  async exec() {
    return new Response({ status: 201, body: { id: '1' } });
  }
}

@Action({ method: 'GET', path: ':id' })
export class ShowAction extends BaseAction {
  async exec() {
    return { id: this.params['id'] };
  }
}

@Action({ abstract: true })
export abstract class AbstractAction extends BaseAction {
  @Before()
  authenticate() {
    if (!this.headers['authorization']) {
      return new Response({ status: 401 });
    }
  }
}

@Action({ method: 'PATCH', path: ':id' })
export class UpdateAction extends AbstractAction {
  async exec() {
    return { updated: true };
  }
}

export const threads = {
  IndexAction,
  CreateAction,
  ShowAction,
  UpdateAction,
};

@Action({})
export class MessageIndexAction extends BaseAction {
  async exec() {
    return { messages: [], ...this.params };
  }
}

@Action({ method: 'POST' })
export class MessageCreateAction extends BaseAction {
  async exec() {
    return new Response({ status: 201, body: { id: 'm1' } });
  }
}

export const messages = { MessageIndexAction, MessageCreateAction };

export async function createTestApp(
  controllers: ActionControllerClass[],
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    controllers,
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export function pathParam(name: string) {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  };
}

export const okResponse = {
  responses: {},
};

export const inputErrorResponse = {
  content: {
    'application/json': {
      schema: {
        $ref: '#/components/schemas/errors.InputError',
      },
    },
  },
};
