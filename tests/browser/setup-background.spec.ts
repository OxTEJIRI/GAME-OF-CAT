import { expect, test } from '@playwright/test';

test('the setup screen plays the supplied silent funeral video slowly on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const video = page.getByTestId('setup-background');
  await expect(video).toBeVisible();
  await expect(page.getByRole('button', { name: 'New campaign' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /War of the Nine Lives/ })).toBeVisible();
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('loop', true);
  await expect(video).toHaveJSProperty('playsInline', true);

  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBeCloseTo(0.72, 1);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(1);
  await page.screenshot({ path: 'test-results/setup-background-desktop.png' });
});

test('the setup screen preserves readable controls on phone and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const video = page.getByTestId('setup-background');
  await expect(video).toBeVisible();
  await expect(page.getByRole('button', { name: 'New campaign' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await expect(video).toHaveJSProperty('muted', true);
  await page.screenshot({ path: 'test-results/setup-background-phone.png' });
});
