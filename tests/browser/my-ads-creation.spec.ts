import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { auditSupply } from './audit-ui-fixtures';

for (const width of [1440, 390]) {
  test(`My ads: one form, private draft and explicit publication at ${width}px`, async ({ page, baseURL }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 844 });
    const cleanup = await auditSupply(page.request, baseURL!);
    const before = (await (await page.request.get('/v1/me/tutor')).json()).profile;
    const original = (await (await page.request.get('/v1/me/listings')).json()).listings[0];
    try {
    await page.goto('/tutor/listings');
    await page.getByRole('button', { name: 'Create an ad', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create teaching offer', exact: true })).toBeFocused();
    await expect(page.getByRole('list', { name: 'Offer editing progress', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('About the class', { exact: true })).toHaveValue(before.biography);
    await expect(page.getByLabel('Tuition rate (INR)', { exact: true })).toHaveValue('650');
    await expect(page.getByText('Your saved profile photo is ready. Change photo', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your city', { exact: true })).toHaveCount(0);
    const title = 'Physics lessons with clear examples and guided exercises for curious school students';
    await page.getByLabel('Ad title', { exact: true }).fill(title);
    await page.getByLabel('About the class', { exact: true }).fill('A new class description.');
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `docs/qa/evidence/2026-11-18/my-ads-form-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Preview my ad', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your ad before publishing', exact: true })).toBeVisible();
    expect((await (await page.request.get('/v1/me/listings')).json()).listings).toHaveLength(1);
    expect((await (await page.request.get('/v1/me/tutor')).json()).profile).toEqual(before);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `docs/qa/evidence/2026-11-18/my-ads-preview-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Edit details', exact: true }).click();
    await expect(page.getByLabel('Ad title', { exact: true })).toHaveValue(title);
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    await expect(page.getByText('Your ad is saved as a private draft.', { exact: true })).toBeVisible();
    const saved = (await (await page.request.get('/v1/me/listings')).json()).listings;
    expect(saved).toHaveLength(2);
    const draft = saved.find((row: { id: string }) => row.id !== original.id);
    expect(draft.status).toBe('DRAFT');
    expect((await page.request.get('/v1/listings/' + draft.id)).status()).toBe(404);
    expect(saved.find((row: { id: string }) => row.id === original.id)).toEqual(original);
    await page.reload();
    await page.getByRole('complementary', { name: 'Your ads', exact: true })
      .getByRole('button', { name: 'Physics Draft', exact: true }).click();
    const publication = page.getByRole('complementary', { name: 'Ad publication', exact: true });
    await publication.getByRole('button', { name: 'Publish my ad', exact: true }).click();
    await expect(publication).toContainText('Your ad is online');
    expect((await page.request.get('/v1/listings/' + draft.id)).status()).toBe(200);
    expect((await page.request.get('/v1/listings/' + original.id)).status()).toBe(200);
    expect((await (await page.request.get('/v1/me/tutor')).json()).profile).toEqual(before);
    await info.attach(`my-ads-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    } finally {
      const state = (await (await page.request.get('/v1/me/listings')).json()).listings;
      for (const current of state.filter((row: { id: string }) => row.id !== original.id)) {
        expect((await page.request.post('/v1/me/listings/' + current.id + '/actions/ARCHIVE', {
          headers: { Origin: baseURL! }, data: { revision: current.revision },
        })).status()).toBe(200);
      }
      await cleanup();
    }
  });
}
