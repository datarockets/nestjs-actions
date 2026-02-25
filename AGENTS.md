See @README.md to understand how actions work.

## Entrypoints

- Public exports: `index.ts`
- Router orchestration: `router.ts`
- Routing DSL + traversal: `routing/`
- Runtime execution + controller wiring: `runtime/`
- OpenAPI spec builders: `openapi/`
- Foundational action primitives: `core/`
- Test entrypoint (integration): `tests/integration.spec.ts`

## Task-to-file map

- Add or change route declaration semantics (`path`, `resources`, traversal): `routing/dsl.ts`, `routing/process-routes.ts`, `routing/types.ts`
- Change request execution lifecycle (before hooks, `exec`, response normalization): `runtime/execute-action.ts`
- Change controller method generation / Nest bindings: `runtime/create-controller.ts`
- Change OpenAPI operation output:
  - Responses: `openapi/operation.responses.ts`
  - Parameters/query/path: `openapi/operation.parameters.ts`
  - Security: `openapi/operation.security.ts`
  - Request body: `openapi/operation.request-body.ts`
  - Components/schemas helpers: `openapi/components.ts`, `openapi/schema.ts`
  - Top-level document assembly: `openapi/builder.ts`, `openapi/types.ts`
- Change action decorators/base primitives and shared framework types: `core/`
- Change typed response helpers/errors used by actions: `responses/`

## Tests map

- Cross-subsystem router integration coverage: `tests/integration.spec.ts`
- Shared fixtures: `tests/fixtures/router.fixtures.ts`
- Routing-focused specs: `routing/*.spec.ts`
- Runtime-focused specs: `runtime/*.spec.ts`
- OpenAPI-focused specs: `openapi/*.spec.ts`

## Where to implement common changes

- New routing behavior: update `routing/` first; keep `router.ts` as a thin orchestrator
- New runtime behavior: implement in `runtime/`; only adjust `router.ts` wiring if required
- New OpenAPI behavior: implement in focused `openapi/operation.*.ts` or `openapi/components.ts`; keep `openapi/builder.ts` focused on composition
- New framework primitives/decorator behavior: implement in `core/`
- New integration scenario: add to `tests/integration.spec.ts`; keep reusable setup data in `tests/fixtures/`

## Instructions

- After updating code, update README.md if api is changed
- Format code after changes
- When working on spec generation, consider OpenAPI 3.2 compatibility
