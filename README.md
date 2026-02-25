Actions, a better way to define endpoint handlers in Next.js applications.

## Quick Start

An Action is a class that is respoinsible for handling HTTP requests in Nest.js application:

```ts
// src/api/actions/hello.action.ts
import { Action, BaseAction } from 'src/lib/actions';

@Action({})
export class HelloAction extends BaseAction {
  async exec() {
    return {
      hello: 'world!',
    };
  }
}
```

Action class gets instantiated on every request and there are `request`, `response`, `moduleRef`, `headers`, `params`, and `body` properties available:

```ts
@Action({
  path: ':name',
})
export class HelloAction extends BaseAction {
  async exec() {
    return {
      hello: this.params['name'],
    };
  }
}
```

It is possible to use `response` to change response status code:

```ts
@Action({
  method: 'POST',
})
export class CreateAction extends BaseAction {
  async exec() {
    this.response.status(201);
    return {
      hello: this.body['name'],
    };
  }
}
```

However, unless you need to do advanced things like streaming, it is encouraged to use a Response object:

```ts
import { Action, BaseAction, Response } from 'src/lib/actions';

@Action({
  method: 'POST',
})
export class CreateAction extends BaseAction {
  async exec() {
    return new Response({
      status: 201,
      body: {
        hello: this.body['name'],
      },
    });
  }
}
```

## Routing

```ts
// src/api/api.module.ts
import { router } from 'src/lib/actions';
import { HelloAction } from './actions/hello/hello.action';
import { CreateAction } from './actions/hello/create.action';

@Module({
  controllers: router
    .create([
      router.path('hello', HelloAction),
      router.path('hello', CreateAction),
    ])
    .controllers(),
})
export class ApiModule {}
```

`router.path` receives 2 arguments: path and action class. Route's path gets combined with action's path to form the full url.

In real-world application it could be problematic to list all the actions in router so it's possible to pass modules to `path`.

```ts
/*
src/api/
  actions/
    hello/
      index.ts
      hello.action.ts
      create.action.ts
    index.ts
*/

// src/api/actions/hello/index.ts
export * from './hello.action';
export * from './create.action';

// src/api/actions/index.ts
export * as hello from './hello';
```

```ts
import * as actions from './actions';

router.create([router.path('hello', actions.hello)]);
```

### Resourceful routing

```
src/api/
  actions/
    threads/
      messages/
        create.action.ts  -- method POST
        index.action.ts
        index.ts          -- exports * from create and index actions
      create.action.ts    -- { method: "POST" }
      index.action.ts     -- { method: "GET" }
      index.ts            -- exports * from actions, exports * as messages from messages
      show.action.ts      -- { method: "GET", path: ":id" }
      update.action.ts    -- { method: "PATCH", path: ":id" }
      delete.action.ts    -- { method: "DELETE", path: ":id" }
    settings/
      billing/
        index.ts
        update.action.ts
      index.ts
      show.action.ts
      update.action.ts
  index.ts
```

```ts
router.create([
  router.resources('threads', { to: actions.threads }, [
    router.resources('messages', { to: actions.threads.messages }),
  ]),
  router.path('settings', { to: actions.settings }, [
    router.path('billing', { to: actions.settings.billing }),
  ]),
]);
```

This would produce following routes:

```
POST   /threads
GET    /threads
GET    /threads/:id
PATCH  /threads/:id
DELETE /threads/:id
POST   /threads/:thread_id/messages
GET    /threads/:thread_id/messages
GET    /settings
PATCH  /settings
PATCH  /settings/billing
```

### Custom parameter names

By default, nested resources use the singularized resource name followed by `Id` for the parameter (e.g., `:threadId`). You can customize this with the `param` option:

```ts
router.resources('workspaces', { param: 'slug' }, [
  router.resources('threads'),
]);
```

This would produce routes like:

```
GET    /workspaces/:workspaceSlug/threads
```

Instead of the default `/workspaces/:workspaceId/threads`.

### Auto-traversal

We can let router to traverse the `actions` object:

```ts
// prettier-ignore
router.create(
  [
    router.resources("threads", [
      router.resources("messages")
    ]),
    router.path("settings", [
      router.path("billing")
    ]),
  ],
  actions,
);
```

`router` would try to traverse `actions` by accessing keys equal to path:

```ts
actions['threads'];
actions['threads']['messages'];
actions['settings'];
actions['settings']['billing'];
```

## Before hooks

Use the `@Before()` decorator to mark methods as before hooks. The framework discovers all `@Before()` methods across the class hierarchy and runs them in parent-first order. If any hook returns a `Response`, execution stops and that response is sent — the `exec` method won't be called.

```ts
import { Action, Before, BaseAction, Response } from 'src/lib/actions';
import * as users from 'src/users';

@Action({
  method: 'POST',
})
export class CreateAction extends BaseAction {
  currentUser: users.User;

  @Before()
  async authenticate() {
    if (!this.headers['Authorization']) {
      return new Response({
        status: 401,
      });
    }
    const authorization = this.headers['Authorization'].split(' ');

    this.currentUser = (await this.tokens.find(authorization[1])).user;
  }

  async exec() {
    return { hello: this.body['name'] };
  }

  private get tokens() {
    return this.moduleRef.get(users.Tokens);
  }
}
```

Before hooks are most useful in combination with inheritance.

## Inheritance

```ts
// src/api/actions/api.action.ts
import { Action, Before, BaseAction, Response } from 'src/lib/actions';

@Action({
  abstract: true,
})
export abstract class ApiAction extends BaseAction {
  currentUser: users.User;

  @Before()
  async authenticate() {
    if (!this.headers['Authorization']) {
      return new Response({
        status: 401,
      });
    }
    const authorization = this.headers['Authorization'].split(' ');

    this.currentUser = (await this.tokens.find(authorization[1])).user;
  }

  private get tokens() {
    return this.moduleRef.get(users.Tokens);
  }
}
```

```ts
// src/api/actions/threads/create.action.ts
import { Action, Before } from 'src/lib/actions';
import { ApiAction } from 'src/api/actions/api.action';
import * as workspaces from 'src/workspaces';

@Action({})
export class CreateAction extends ApiAction {
  @Before()
  async validateBody() {
    if (!this.body['name']) {
      return new Response({ status: 400, body: { error: 'name is required' } });
    }
  }

  async exec() {
    const thread = this.threads.create({
      author: this.currentUser,
      name: this.body['name'],
    });

    return thread;
  }

  private get threads() {
    return this.moduleRef.get(workspaces.Threads);
  }
}
```

In this example, `authenticate` (from `ApiAction`) runs first, then `validateBody` (from `CreateAction`). Each class defines its own `@Before()` hooks without needing to call `super` — the framework chains them automatically.

## Memoized Getters

The `@Action` decorator automatically memoizes `params`, `query`, and `body` getters when they are overridden in a subclass. The getter runs once per request, and subsequent accesses return the cached result. Inherited getters from `BaseAction` are not affected.

```ts
import { z } from 'zod';

@Action({ path: ':id' })
export class ShowAction extends BaseAction {
  static readonly Params = z.object({
    id: z.coerce.number(),
  });

  // Automatically memoized — Params.parse() runs only once per request
  get params() {
    return ShowAction.Params.parse(this.request.params);
  }

  async exec() {
    // this.params can be accessed multiple times without re-parsing
    return { id: this.params.id };
  }
}
```

## OpenAPI spec

It is possible to generate OpenAPI 3.2 spec for actions.

### Describing responses

You can specify reponses in `Action` and `Before` decorators:

```ts
import { UnauthorizedError } from 'src/lib/actions/responses';

@Action({})
export abstract class ApiAction extends BaseAction {
  @Before({
    openapi: {
      responses: {
        401: UnauthorizedError.Schema,
      },
    },
  })
  authorize() {
    if (!this.currentUser) {
      return new UnauthorizedError();
    }
  }

  get currentUser() {
    // ...
  }
}
```

Inherited actions don't need to repeat errors from before hooks from parent classes, it will be inferred automatically.

```ts
import * as data from 'src/api/data';

@Action({
  openapi: {
    responses: {
      200: data.User,
    },
  },
})
export class ShowAction extends ApiAction {
  exec() {
    return new Ok({ name: this.currentUser.name });
  }
}
```

Response schemas are emitted inline by default. If a schema is registered in the global zod registry with an `id` (for example `data.User = z.object(...).meta({ id: 'core.User' })`), the generated response uses a `$ref` to `#/components/schemas/core.User`.

The response `description` in the generated spec is taken from the zod schema's `.meta({ description: "..." })`. If no description is provided, the field is omitted. Actions without any declared responses produce an empty `responses` object.

```ts
@Action({
  openapi: {
    responses: {
      201: z.object({ id: z.string() }).meta({ description: 'Created user' }),
    },
  },
})
export class CreateAction extends ApiAction {
  exec() {
    return new Response({ status: 201, body: { id: '1' } });
  }
}
```

Alternatively, you could define static `Response` field in an action:

```ts
@Action({})
export class ShowAction extends ApiAction {
  static Response = z
    .object({
      name: z.string(),
    })
    .meta({ openapi: { response: { status: 200 } } });

  exec() {
    return Ok.render(ShowAction.Response, { name: this.currentUser.name });
  }
}
```

### Request Body

If an action defines a `static Request` zod object, a `requestBody` with `application/json` content is automatically included in the generated spec:

```ts
@Action({ method: 'POST' })
export class CreateAction extends BaseAction {
  static Request = z.object({
    name: z.string(),
    age: z.number().optional(),
  });

  exec() {
    return {};
  }
}
```

This produces:

```yaml
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          name:
            type: string
          age:
            type: number
        required: [name]
```

If the schema is registered with an `id`, the generated spec uses a `$ref` to `#/components/schemas/<id>`. A `description` from `.meta({ description: "..." })` is used as the `requestBody.description`.

Note: SSE actions ignore `static Request`.

### Path Parameters

Path parameters (e.g., `{id}`, `{threadId}`) are automatically included in the generated spec. By default, each parameter is typed as `string`.

If an action defines a `static Params` zod object, the schema for matching fields is extracted and used instead:

```ts
@Action({ method: 'GET', path: ':id' })
export class ShowAction extends BaseAction {
  static Params = z.object({
    id: z.number(),
  });

  exec() {
    return {};
  }
}
```

This produces `{ type: "number" }` for the `id` path parameter in the spec, rather than the default `{ type: "string" }`.

### Query Parameters

If an action defines a `static Query` zod object, query parameters are automatically included in the generated spec. Each property becomes a query parameter, with `required` derived from the schema:

```ts
@Action({})
export class IndexAction extends BaseAction {
  static Query = z.object({
    page: z.number().optional(),
    limit: z.number(),
  });

  exec() {
    return {};
  }
}
```

This produces two query parameters: `page` (optional, `type: "number"`) and `limit` (required, `type: "number"`).

### Security

Use the `openapi.security` option in `@Before` or `@Action` to declare security requirements on operations. The value follows the OpenAPI [Security Requirement Object](https://spec.openapis.org/oas/v3.1.0#security-requirement-object) format — an array of objects where each key is a scheme name and the value is a list of scopes:

```ts
import { UnauthorizedError } from 'src/lib/actions/responses';

@Action({ abstract: true })
export abstract class ApiAction extends BaseAction {
  @Before({
    openapi: {
      responses: { 401: UnauthorizedError.Schema },
      security: [{ oauth2: ['openid', 'profile'] }],
    },
  })
  authorize() {
    if (!this.currentUser) {
      return new UnauthorizedError();
    }
  }
}
```

Inherited actions automatically inherit security from parent `@Before` hooks. If a child class defines its own `openapi.security` in a `@Before` hook, it overrides the parent's security. Security defined in `@Action` overrides `@Before` security:

```ts
@Action({
  openapi: {
    security: [{ apiKey: [] }],
  },
})
export class PublicAction extends ApiAction {
  exec() {
    return {};
  }
}
```

To include `securitySchemes` in the generated spec, pass them to `spec()`:

```ts
api.spec({
  prefix: '/api',
  securitySchemes: {
    oauth2: {
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: 'https://example.com/authorize',
          tokenUrl: 'https://example.com/token',
        },
      },
    },
  },
});
```

### Scalar UI

Serve an interactive API documentation page powered by Scalar (loaded from CDN). The spec is generated from your actions routes.

```ts
import { ScalarModule } from 'src/lib/actions';
import { api } from './api/api.module';

@Module({
  imports: [ScalarModule.forRoot({ spec: api.spec() })],
})
export class AppModule {}
```

This exposes:

- `GET /docs` — Scalar API reference page
- `GET /spec.json` — OpenAPI JSON spec

Paths, title, and Scalar options are configurable:

```ts
ScalarModule.forRoot({
  spec: api.spec(),
  docsPath: 'api-docs',
  specPath: 'openapi.json',
  title: 'My API',
  scalar: {
    theme: 'purple',
  },
});
```

The `spec()` method accepts an optional `prefix` to prepend to all paths:

```ts
api.spec({ prefix: '/api/v1' });
```

## Server-Sent Events (SSE)

Use `method: 'SSE'` to create an SSE endpoint. The `exec` method should be an async generator that yields events:

```ts
import { Action, BaseAction } from 'src/lib/actions';

@Action({ method: 'SSE' })
export class StreamAction extends BaseAction {
  async *exec() {
    yield { data: { hello: 'world' } };
  }
}
```

The framework manages the response — it iterates the generator, formats each yielded value as an SSE message, and ends the response when the generator returns. When the client disconnects, the generator is stopped via `generator.return()`, which triggers any `finally` blocks for cleanup. SSE routes appear as `GET` in the generated OpenAPI spec.

### SSE Response Schema

Define a `static ResponseItem` zod schema to describe the shape of each individual event in the stream. The generated spec uses the OpenAPI 3.2 `itemSchema` keyword under `text/event-stream`:

```ts
@Action({ method: 'SSE' })
export class StreamAction extends BaseAction {
  static readonly ResponseItem = z.object({
    symbol: z.string(),
    price: z.string(),
  });

  async *exec() {
    yield { data: { symbol: 'AAPL', price: '100.25' } };
  }
}
```

This produces:

```yaml
responses:
  "200":
    content:
      text/event-stream:
        schema:
          type: string
        itemSchema:
          type: object
          properties:
            symbol:
              type: string
            price:
              type: string
          required: [symbol, price]
```

If the schema is registered with an `id`, the generated spec uses a `$ref` for `itemSchema`. Before hook error responses (e.g., 401) are merged alongside the SSE response.

Note: SSE actions use `ResponseItem` instead of `Response`. `static Response` is ignored on SSE actions.

## Error Handling

`ZodError` exceptions thrown from actions (e.g., from `params`, `body`, or `query` getters using `z.parse()`) are automatically caught and returned as a `422` response with an `input-error` code and a flat array of validation issues:

```json
{
  "code": "input-error",
  "details": [
    {
      "code": "invalid_type",
      "message": "Expected string, received number",
      "path": ["name"]
    }
  ]
}
```

Each issue contains `code` (Zod issue code), `message` (human-readable description), and `path` (array of field path segments).

When an action defines `static Params`, `static Query`, or `static Request`, a `422` response referencing `InputError.Schema` is automatically included in the generated OpenAPI spec.
