Actions, a better way to define endpoint handlers in Next.js applications.

## Quick Start

An Action is a class that is respoinsible for handling HTTP requests in Nest.js application:

```ts
// src/api/actions/hello.action.ts
import { Action, BaseAction } from "src/lib/actions";

@Action({})
export class HelloAction extends BaseAction {
  async exec() {
    return {
      hello: "world!",
    };
  }
}
```

Action class gets instantiated on every request and there are `request`, `response`, `moduleRef`, `headers`, `params`, and `body` properties available:

```ts
@Action({
  path: ":name",
})
export class HelloAction extends BaseAction {
  async exec() {
    return {
      hello: this.params["name"],
    };
  }
}
```

It is possible to use `response` to change response status code:

```ts
@Action({
  method: "POST",
})
export class CreateAction extends BaseAction {
  async exec() {
    this.response.status(201);
    return {
      hello: this.body["name"],
    };
  }
}
```

However, unless you need to do advanced things like streaming, it is encouraged to use a Response object:

```ts
import { Action, BaseAction, Response } from "src/lib/actions";

@Action({
  method: "POST",
})
export class CreateAction extends BaseAction {
  async exec() {
    return new Response({
      status: 201,
      body: {
        hello: this.body["name"],
      },
    });
  }
}
```

## Routing

```ts
// src/api/api.module.ts
import { router } from "src/lib/actions";
import { HelloAction } from "./actions/hello/hello.action";
import { CreateAction } from "./actions/hello/create.action";

@Module({
  controllers: router
    .create([
      router.path("hello", HelloAction),
      router.path("hello", CreateAction),
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
export * from "./hello.action";
export * from "./create.action";

// src/api/actions/index.ts
export * as hello from "./hello";
```

```ts
import * as actions from "./actions";

router.create([router.path("hello", actions.hello)]);
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
  router.resources("threads", actions.threads, [
    router.resources("messages", actions.threads.messages),
  ]),
  router.path("settings", actions.settings, [
    router.path("billing", actions.settings.billing),
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
actions["threads"];
actions["threads"]["messages"];
actions["settings"];
actions["settings"]["billing"];
```

## Before hooks

```ts
import * as users from "src/users";

@Action({
  method: "POST",
})
export class CreateAction extends BaseAction {
  currentUser: users.User;

  before() {
    if (!this.headers["Authorization"]) {
      return new Response({
        status: 401,
      });
    }
    const authorization = this.headers["Authorization"].split(" ");

    this.currentUser = (await this.tokens.find(authorization[1])).user;
  }

  private get tokens() {
    return this.moduleRef.get(users.Tokens);
  }
}
```

Before hooks make more sense in combination with inheritance of actions.

## Inheritance

```ts
// src/api/actions/api.action.ts

@Action({
  abstract: true,
})
export abstract class ApiAction extends BaseAction {
  currentUser: users.User;

  before() {
    if (!this.headers["Authorization"]) {
      return new Response({
        status: 401,
      });
    }
    const authorization = this.headers["Authorization"].split(" ");

    this.currentUser = (await this.tokens.find(authorization[1])).user;
  }

  private get tokens() {
    return this.moduleRef.get(users.Tokens);
  }
}
```

```ts
// src/api/actions/threads/create.action.ts
import { ApiAction } from "src/api/actions/api.action";
import * as workspaces from "src/workspaces";

@Action({})
export class CreateAction extends ApiAction {
  exec() {
    const thread = this.threads.create({
      author: this.currentUser,
      name: this.body["name"],
    });

    return thread;
  }

  private get threads() {
    return this.moduleRef.get(workspaces.Threads);
  }
}
```

Before hooks could return a Response and then exec method won't be called or it can return nothing and in that case action's exec would be called.
