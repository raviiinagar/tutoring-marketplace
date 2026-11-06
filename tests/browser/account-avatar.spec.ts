import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { auditAccount } from './audit-ui-fixtures';

for (const width of [1440, 390]) test(`saved owner photo stays consistent across settings/dashboard/navbar after refresh and re-login at ${width}px`, async ({ page, baseURL }, info) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width, height: 844 });
  const { email, password } = await auditAccount(page.request, baseURL!);
  const headers = { Origin: baseURL! };
  expect((await page.request.post('/v1/me/tutor/introduction', { headers, data: { display_name: 'Fictional Avatar Tutor', biography: 'Patient Physics lessons.', subject_ids: ['subject-physics'], hourly_rate_paise: 50000, identity_country: 'IN', identity_document: 'AADHAAR', adult_confirmed: true, public_email_consent: false } })).status()).toBe(200);
  const created = await page.request.post('/v1/me/listings', { headers, data: { title: 'Patient Physics lessons with clear explanations and guided practice for curious school learners', description: 'Fictional practice.', domain_id: 'school', subject_id: 'subject-physics', level_id: 'level-class-10', curriculum_id: 'curriculum-cbse', language_ids: ['language-english'], currency: 'INR', teaching_mode: 'ONLINE', rate_paise: 50000, rate_unit: 'HOUR', trial_kind: 'NONE' } });
  expect(created.status()).toBe(201); const ad = (await created.json()).listing;
  await page.goto('/tutor');
  await page.locator('summary').filter({ hasText: /^Public profile photo/ }).click();
  async function upload(color: string) {
    const image = await sharp({ create: { width: 128, height: 160, channels: 3, background: color } }).png().toBuffer();
    await page.getByLabel('Portrait image', { exact: true }).setInputFiles({ name: 'fictional-avatar.png', mimeType: 'image/png', buffer: Buffer.concat([image, Buffer.from('FICTIONAL-TUTOR-EVIDENCE')]) });
    await page.getByRole('checkbox', { name: 'This is my own adult portrait, and I agree to display it publicly once scanning passes.', exact: true }).check();
    const completed = page.waitForResponse(r => new URL(r.url()).pathname === '/v1/me/tutor/photo' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    const response = await completed; expect(response.status()).toBe(201); return (await response.json()).photo.id as string;
  }
  async function checkPhoto(p: Page, id: string) {
    const images = p.getByAltText('Your profile photo');
    await expect.poll(async () => images.count()).toBeGreaterThan(0);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute('src', '/v1/me/tutor/photo/' + id);
      await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
    }
  }
  const first = await upload('#dd8888');
  await checkPhoto(page, first); // navbar updates immediately on the upload page
  for (const route of ['/account/settings', '/account', '/tutor/dashboard']) {
    await page.goto(route); await expect(page.getByRole('main').getByAltText('Your profile photo')).toBeVisible(); await checkPhoto(page, first);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.reload(); await checkPhoto(page, first);
  await page.goto('/tutor'); await page.locator('summary').filter({ hasText: /^Public profile photo/ }).click();
  const replacement = await upload('#6688bb'); expect(replacement).not.toBe(first); await checkPhoto(page, replacement);
  expect((await page.request.get('/v1/me/tutor/photo/' + first)).status()).toBe(404);
  await page.goto('/account/settings'); await checkPhoto(page, replacement);
  const preview = await page.request.get('/v1/me/tutor/photo/' + replacement);
  expect(preview.status()).toBe(200); expect(preview.headers()['cache-control']).toContain('no-store'); expect(preview.headers()['content-type']).toContain('image/jpeg');
  expect((await page.request.get('/v1/me/tutor')).ok()).toBe(true);
  expect((await (await page.request.get('/v1/me/tutor')).json()).profile.publication_status).toBe('DRAFT');
  expect((await (await page.request.get('/v1/me/listings')).json()).listings.find((x: { id: string }) => x.id === ad.id).status).toBe('DRAFT');
  expect((await page.request.get('/v1/listings/' + ad.id)).status()).toBe(404);
  expect((await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze()).violations).toEqual([]);
  await info.attach(`private-avatar-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/auth\/signin$/);
  expect((await page.request.get('/v1/me/tutor/photo/' + replacement)).status()).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/account$/);
  await checkPhoto(page, replacement); await expect(page.getByRole('main').getByAltText('Your profile photo')).toBeVisible();
  await page.goto('/tutor'); await page.locator('summary').filter({ hasText: /^Public profile photo/ }).click();
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByAltText('Your profile photo')).toHaveCount(0);
  await page.goto('/account'); await expect(page.getByRole('heading', { name: 'Fictional Audit Learner', exact: true })).toBeVisible();
  await expect(page.getByAltText('Your profile photo')).toHaveCount(0);
  expect((await page.request.get('/v1/listings/' + ad.id)).status()).toBe(404);
  expect((await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze()).violations).toEqual([]);
});

