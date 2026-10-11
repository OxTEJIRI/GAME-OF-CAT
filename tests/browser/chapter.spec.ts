import { expect, test, type Page } from '@playwright/test';

async function beginCampaign(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New campaign' }).click();
  await page.getByRole('button', { name: 'Take the crown' }).click();
  await expect(page.getByRole('heading', { name: 'Crownrest Citadel' })).toBeVisible();
}

async function marchToGreyfen(page: Page) {
  await page.getByRole('button', { name: 'Region' }).click();
  await page.getByRole('button', { name: /Crow Watch/ }).click();
  await page.getByRole('button', { name: /Order march/ }).click();
  await expect(page.getByText(/arrives when the next turn resolves/i)).toBeVisible();
  await page.getByRole('button', { name: /Advance turn to arrive/ }).click();
  await page.getByRole('button', { name: /Greyfen Pass/ }).click();
  await page.getByRole('button', { name: /Order march/ }).click();
  await page.getByRole('button', { name: /Advance turn to arrive/ }).click();
  await page.getByRole('button', { name: /Enter Greyfen battle/ }).click();
  await expect(page.getByText(/Field limit: 6 squads/)).toBeVisible();
}

async function winBattle(page: Page, verifyPause = false) {
  await page.getByRole('button', { name: 'Begin battle' }).click();
  if (verifyPause) {
    await page.keyboard.press('2'); await page.keyboard.press('h');
    await expect(page.getByText('Hold order issued.')).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
    await expect(page.getByText(/tab became hidden/i)).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
    await page.getByRole('button', { name: /Resume/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'The false banner falls.' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/survive, \d+ lost/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Claim the field' }).click();
  await expect(page.getByRole('heading', { name: /Latest battle: victory/i })).toBeVisible();
}

test('evidence strategy completes the chapter and survives save/reload', async ({ page }) => {
  await beginCampaign(page);
  await page.getByRole('button', { name: 'Council' }).click();
  await page.getByRole('button', { name: /Open the royal accounts/ }).click();
  await page.getByRole('button', { name: 'Kingdom' }).click();
  await page.getByRole('button', { name: /Infantry/ }).click();
  await page.getByRole('button', { name: /Archers/ }).click();
  await marchToGreyfen(page);
  await winBattle(page, true);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: /Latest battle: victory/i })).toBeVisible();
  await page.getByRole('button', { name: 'Confront the traitor' }).click();
  await expect(page.getByText(/The ledger ending/i)).toBeVisible();
});

test('defence strategy completes the iron-gate ending', async ({ page }) => {
  await beginCampaign(page);
  await page.getByRole('button', { name: 'Council' }).click();
  await page.getByRole('button', { name: /Keep guards in the palace/ }).click();
  await page.getByRole('button', { name: 'Kingdom' }).click();
  await page.getByRole('button', { name: /Upgrade to level 2/ }).click();
  await page.getByRole('button', { name: /Infantry/ }).click();
  await marchToGreyfen(page);
  await winBattle(page);
  await page.getByRole('button', { name: 'Confront the traitor' }).click();
  await expect(page.getByText(/The iron gate ending/i)).toBeVisible();
});

test('touch-sized battle controls remain usable in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await beginCampaign(page);
  await marchToGreyfen(page);
  await page.getByRole('button', { name: 'Begin battle' }).click();
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.getByRole('button', { name: /crown cavalry, 100 health/i }).click();
  await page.getByRole('button', { name: /brace/i }).click();
  await expect(page.getByText('Brace order issued.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retreat/ })).toBeVisible();
});
