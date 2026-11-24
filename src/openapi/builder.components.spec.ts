import { z } from 'zod';

import { Action, BaseAction } from '../index';
import { router } from '../router';

describe('openapi/builder components', () => {
  it('fixes $ref inside component schemas and includes transitive references', () => {
    const PartA = z
      .object({ type: z.literal('a'), value: z.string() })
      .meta({ id: 'test.PartA' });
    const PartB = z
      .object({ type: z.literal('b'), value: z.number() })
      .meta({ id: 'test.PartB' });
    const Container = z
      .object({ parts: z.array(z.union([PartA, PartB])) })
      .meta({ id: 'test.Container' });

    @Action({
      openapi: { responses: { 200: Container } },
    })
    class ContainerAction extends BaseAction {
      exec() {
        return {};
      }
    }

    const result = router.create([
      router.path('container', { to: { ContainerAction } }),
    ]);
    const spec = result.spec();

    const containerSchema = spec.components?.schemas['test.Container'];
    expect(containerSchema).toBeDefined();
    expect(containerSchema?.['$schema']).toBeUndefined();
    expect(containerSchema?.['id']).toBeUndefined();

    const raw = JSON.stringify(containerSchema);
    expect(raw).toContain('#/components/schemas/test.PartA');
    expect(raw).toContain('#/components/schemas/test.PartB');
    expect(raw).not.toMatch(/"\$ref"\s*:\s*"test\.Part[AB]"/);

    expect(spec.components?.schemas['test.PartA']).toBeDefined();
    expect(spec.components?.schemas['test.PartB']).toBeDefined();
  });
});
