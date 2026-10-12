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

  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const music = page.getByTestId('background-music');
  await expect(settings.getByRole('checkbox', { name: 'Background music' })).toBeChecked();
  await expect.poll(() => music.evaluate((element: HTMLAudioElement) => element.loop)).toBe(true);
  await expect.poll(() => music.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  await settings.getByRole('checkbox', { name: 'Background music' }).uncheck();
  await expect.poll(() => music.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('game-of-cat-audio-v1') ?? '{}').musicEnabled)).toBe(false);
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
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('slider', { name: 'Ambience' })).toBeVisible();
  await expect(settings.getByRole('slider', { name: 'Effects' })).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: 'Background music' })).toBeChecked();
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await expect(video).toHaveJSProperty('muted', true);
  await page.screenshot({ path: 'test-results/setup-background-phone.png' });
});
