import { scenarioTest as test, expect } from '@/fixtures/scenario-fixture';

test.describe('Scenario smoke', () => {
  test('Virtualization perspective loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /virtualization|overview/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
