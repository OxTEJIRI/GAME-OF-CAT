import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function beginCampaign(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).click();
  await page.getByRole('button', { name: 'Take the crown' }).click();
}

async function openMapWithoutTutorial(page: Page) {
  await page.addInitScript(() => localStorage.setItem('game-of-cat-tutorial-v1', JSON.stringify({ active: false, step: 'complete', completed: true })));
  await beginCampaign(page);
  await page.getByRole('button', { name: 'Region' }).click();
}

async function expectNoOverlaps(page: Page) {
  const boxes = await page.locator('.map-node.production').evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { id: node.getAttribute('data-location'), left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }));
  for (let first = 0; first < boxes.length; first += 1) for (let second = first + 1; second < boxes.length; second += 1) {
    const a = boxes[first]; const b = boxes[second];
    const overlaps = Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
  }
}

test('map markers and full labels respond to mouse, keyboard, and touch without decorative interception', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openMapWithoutTutorial(page);

  await page.locator('[data-location="watchtower"] .map-marker-glyph').click();
  await expect(page.locator('.map-detail').getByRole('heading', { name: 'Crow Watch' })).toBeVisible();
  await page.locator('[data-location="pass"] .map-label').click();
  await expect(page.locator('.map-detail').getByRole('heading', { name: 'Greyfen Pass' })).toBeVisible();

  await page.locator('[data-location="shrine"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.map-detail').getByRole('heading', { name: 'Ninefold Shrine' })).toBeVisible();
  await expect(page.locator('[data-location="shrine"]')).toHaveAttribute('aria-pressed', 'true');

  const decorativePointerEvents = await page.evaluate(() => ['.map-art', '.route-layer', '.map-heading'].map((selector) => getComputedStyle(document.querySelector(selector)!).pointerEvents));
  expect(decorativePointerEvents).toEqual(['none', 'none', 'none']);
  await expectNoOverlaps(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverlaps(page);
  await page.locator('[data-location="orchard"] .map-label').tap();
  await expect(page.locator('.map-detail').getByRole('heading', { name: "Miller's Orchard" })).toBeVisible();
});

test('unavailable movement explains the blocking condition', async ({ page }) => {
  await openMapWithoutTutorial(page);
  await page.locator('[data-location="pass"] .map-label').click();
  await expect(page.getByText(/No road connects Crownrest directly to Greyfen Pass/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Order march/ })).toBeDisabled();
  await page.locator('[data-location="watchtower"] .map-label').click();
  await expect(page.getByText(/will arrive at Crow Watch when the next turn resolves/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Order march/ })).toBeEnabled();
});

test('tutorial advances contextually, can be skipped, and can be replayed independently of the save', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('game-of-cat-tutorial-v1'));
  await beginCampaign(page);
  await expect(page.getByText('Prepare for the road')).toBeVisible();
  await page.getByRole('button', { name: /Infantry/ }).click();
  await expect(page.getByText('Hear every voice')).toBeVisible();
  await page.getByRole('button', { name: 'Council' }).click();
  await page.getByRole('button', { name: /Open the royal accounts/ }).click();
  await expect(page.getByText('Open the Crownlands')).toBeVisible();
  await page.getByRole('button', { name: 'Region' }).click();
  await page.locator('[data-location="watchtower"] .map-label').click();
  await expect(page.getByText('Choose a linked road')).toBeVisible();
  await page.getByRole('button', { name: /Skip tutorial/ }).click();
  await expect(page.locator('.tutorial-callout')).toHaveCount(0);

  const records = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('game-of-cat-save-v1')!), tutorial: JSON.parse(localStorage.getItem('game-of-cat-tutorial-v1')!) }));
  expect(records.save.tutorial).toBeUndefined();
  expect(records.tutorial.completed).toBe(true);

  await page.getByRole('button', { name: 'GAME OF CAT' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Replay tutorial' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Kingdom' }).click();
  await expect(page.getByText('Prepare for the road')).toBeVisible();
});
