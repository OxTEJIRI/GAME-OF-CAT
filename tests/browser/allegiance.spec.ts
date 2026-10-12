import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('the title page navigates next to Allegiance, then lists Your banner before the prologue', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('heading', { name: 'Seven kingdoms. Where do you stand?' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to title' }).click();

  await page.getByRole('button', { name: 'Page list' }).click();
  const pages = page.locator('#page-list button');
  await expect(pages.nth(0)).toContainText('Title');
  await expect(pages.nth(1)).toContainText('Allegiance');
  await expect(pages.nth(2)).toContainText('Your banner');
  await expect(pages.nth(3)).toContainText('Prologue');
  await pages.nth(1).click();
  await expect(page.getByRole('heading', { name: 'Seven kingdoms. Where do you stand?' })).toBeVisible();
});

test('realm marker and label pledge lead to a downloadable named banner before Chapter I', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).click();

  await expect(page.getByRole('heading', { name: 'Seven kingdoms. Where do you stand?' })).toBeVisible();
  await expect(page.getByTestId(/^realm-marker-/)).toHaveCount(7);
  await page.screenshot({ path: 'test-results/allegiance-map-desktop.png', fullPage: true });
  await page.getByTestId('realm-marker-frost-frontier').click();
  await expect(page.getByRole('button', { name: 'Choose Frost Frontier' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Frost Frontier' })).toBeVisible();
  await page.getByRole('button', { name: /High Vale.*eagle’s high road/ }).click();
  await expect(page.getByRole('button', { name: 'Choose High Vale' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pledge to High Vale' }).click();

  await expect(page.getByRole('heading', { name: 'Your banner / your allegiance' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Banner name' }).fill('House <Northstar & Co>');
  await expect(page.getByRole('img', { name: /House <Northstar & Co>, loyal to High Vale/ })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download banner certificate/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('banner-high-vale.svg');

  await page.screenshot({ path: 'test-results/allegiance-banner-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Begin Chapter I' }).click();
  await expect(page.getByRole('button', { name: 'Take the crown' })).toBeVisible();
  const campaign = await page.evaluate(() => JSON.parse(localStorage.getItem('game-of-cat-save-v1') ?? '{}'));
  expect(campaign.version).toBe(1);
  expect(campaign.persistent.allegiance).toBeUndefined();
});

test('the allegiance map and certificate fit a touch-sized phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).tap();
  await page.screenshot({ path: 'test-results/allegiance-map-phone.png', fullPage: true });
  await page.getByTestId('realm-marker-storm-coast').tap();
  await expect(page.getByRole('heading', { name: 'Storm Coast' })).toBeVisible();
  await page.getByRole('button', { name: 'Pledge to Storm Coast' }).tap();
  await page.getByRole('textbox', { name: 'Banner name' }).fill('Saltwind House');
  await expect(page.getByRole('img', { name: /Saltwind House, loyal to Storm Coast/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/allegiance-banner-phone.png', fullPage: true });
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.body).toBe(dimensions.viewport);
  await expect(page.getByRole('button', { name: 'Download banner certificate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin Chapter I' })).toBeVisible();
});

test('realm selection responds to keyboard focus and Enter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).click();
  const marker = page.getByTestId('realm-marker-greenreach');
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Greenreach.*Fields beneath a golden sun/ })).toHaveAttribute('aria-pressed', 'true');
});
