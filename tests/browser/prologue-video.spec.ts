import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function openPrologue(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).click();
  if ((await page.evaluate(() => window.innerWidth)) <= 600) await page.locator('.realm-list .realm-option').nth(3).tap();
  else await page.getByTestId('realm-marker-crownlands').click();
  await expect(page.getByRole('button', { name: 'Pledge to Crownlands' })).toBeVisible();
  await page.getByRole('button', { name: 'Pledge to Crownlands' }).click();
  await page.getByRole('textbox', { name: 'Banner name' }).fill('House Crownrest');
  await page.getByRole('button', { name: 'Begin Chapter I' }).click();
}

test('the prologue plays its funeral scene slowly in a muted loop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPrologue(page);

  const scene = page.getByTestId('prologue-scene');
  await expect(scene).toBeVisible();
  await expect(page.getByRole('heading', { name: /The bells stop/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take the crown' })).toBeVisible();
  await expect(page.getByText('working title', { exact: true })).toHaveCount(0);
  const desktopBounds = await scene.boundingBox();
  expect(desktopBounds).not.toBeNull();
  expect(desktopBounds!.x).toBe(0);
  expect(desktopBounds!.y).toBe(0);
  expect(desktopBounds!.width).toBe(1440);
  expect(desktopBounds!.height).toBe(900);
  await expect(scene).toHaveJSProperty('muted', true);
  await expect(scene).toHaveJSProperty('loop', true);
  await expect(scene).toHaveJSProperty('playsInline', true);
  await expect.poll(() => scene.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => scene.evaluate((video: HTMLVideoElement) => video.playbackRate)).toBeCloseTo(0.72, 1);
  await expect.poll(() => scene.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
  await expect.poll(() => scene.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(1);
  await page.screenshot({ path: 'test-results/prologue-video-desktop.png' });
});

test('the prologue pauses for reduced motion on phone and resumes when allowed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPrologue(page);

  const scene = page.getByTestId('prologue-scene');
  await expect(scene).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take the crown' })).toBeVisible();
  const phoneBounds = await scene.boundingBox();
  expect(phoneBounds).not.toBeNull();
  expect(phoneBounds!.x).toBe(0);
  expect(phoneBounds!.y).toBe(0);
  expect(phoneBounds!.width).toBe(390);
  expect(phoneBounds!.height).toBe(844);
  await expect.poll(() => scene.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await page.screenshot({ path: 'test-results/prologue-video-phone.png' });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => scene.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
});
