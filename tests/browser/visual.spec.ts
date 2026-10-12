import { expect, test } from '@playwright/test';

test('phase 4 castle and battlefield visual captures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).click();
  await page.getByRole('button', { name: 'Take the crown' }).click();
  await expect(page.getByRole('heading', { name: 'Crownrest Citadel' })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase4-castle-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/phase4-castle-phone.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Region' }).click();
  await page.getByRole('button', { name: /Crow Watch/ }).click();
  await page.getByRole('button', { name: /Order march/ }).click();
  await page.getByRole('button', { name: /Advance turn to arrive/ }).click();
  await page.getByRole('button', { name: /Greyfen Pass/ }).click();
  await page.getByRole('button', { name: /Order march/ }).click();
  await page.getByRole('button', { name: /Advance turn to arrive/ }).click();
  await page.getByRole('button', { name: /Enter Greyfen battle/ }).click();
  await page.getByRole('button', { name: 'Begin battle' }).click();
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.screenshot({ path: 'test-results/phase4-battle-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/phase4-battle-phone.png', fullPage: true });
});
