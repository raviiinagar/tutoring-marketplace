import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { auditAccount } from './audit-ui-fixtures';

for (const width of [1440, 390]) {
  test(`unified Tutor journey: private resume, explicit publication and removal at ${width}px`, async ({ page, baseURL }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 844 });
    await auditAccount(page.request, baseURL!);
    const headers = { Origin: baseURL! };
    await page.goto('/');
    await expect(page.getByText('Share the subjects you love. Create your free profile and publish your ad for free. Identity verification is optional.', { exact: true })).toBeVisible();
    await page.goto('/tutor/listings');
    const invitation = page.getByRole('link', { name: 'Start your teaching introduction', exact: true });
    await expect(invitation).toHaveAttribute('href', '/tutor');
    await invitation.click();
    await page.getByRole('checkbox', { name: 'Physics', exact: true }).check();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Your public name', { exact: true })).toBeEnabled();
    const me = await (await page.request.get('/v1/me')).json();
    expect(me.user.roles).toEqual(expect.arrayContaining(['LEARNER', 'TUTOR']));
    expect((await (await page.request.get('/v1/me/tutor')).json()).profile).toBeNull();
    await page.reload();
    await expect(page.getByLabel('Your public name', { exact: true })).toBeEnabled();
    await page.getByLabel('Your public name', { exact: true }).fill('Fictional unified Tutor');
    await page.getByLabel('About you, skills and experience', { exact: true }).fill('Patient Physics lessons.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Hourly tuition rate (INR)', { exact: true }).fill('500');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('checkbox', { name: 'I am at least 18 and will provide my own teaching services.', exact: true }).check();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Save introduction and continue', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeEnabled();
    expect((await (await page.request.get('/v1/me/tutor')).json()).profile.publication_status).toBe('DRAFT');
    await page.goto('/tutor/listings');
    await page.getByRole('button', { name: 'Create an ad', exact: true }).click();
    // Superprof-order wizard; each Continue waits for the next step's question.
    const step = async (heading: string) => {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    };
    await step('Title of your ad');
    await page.getByLabel('Ad title', { exact: true }).fill('Patient Physics lessons with clear explanations and guided practice for curious school learners');
    await step('About the class');
    // No minimum length for the class description.
    await page.getByLabel('About the class', { exact: true }).fill('Practical Physics examples.');
    await step('About you');
    await step('Location of the class');
    await page.getByLabel('Your city', { exact: true }).fill('Kota');
    await step('Languages you teach in');
    await step('Hourly fee');
    await step('Adjust your fees');
    await step('Profile picture');
    await step('Check your ad before publishing');
    await expect(page.getByRole('button', { name: 'Publish my ad', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
    const publication = page.getByRole('complementary', { name: 'Ad publication', exact: true });
    await expect(publication.getByRole('button', { name: 'Publish my ad', exact: true })).toBeDisabled();
    let state = await (await page.request.get('/v1/me/listings')).json();
    const id = state.listings[0].id;
    expect(state.listings[0].status).toBe('DRAFT');
    expect((await page.request.get('/v1/listings/' + id)).status()).toBe(404);
    const portrait = await sharp({ create: { width: 128, height: 160, channels: 3, background: '#abcdef' } }).png().toBuffer();
    expect((await page.request.post('/v1/me/tutor/photo', { headers, data: { media_type: 'image/png', data: Buffer.concat([portrait, Buffer.from('FICTIONAL-TUTOR-EVIDENCE')]).toString('base64'), public_consent: true } })).status()).toBe(201);
    // Uploading a portrait alone must never make an ad public.
    expect((await page.request.get('/v1/listings/' + id)).status()).toBe(404);
    await page.reload();
    await publication.getByRole('button', { name: 'Publish my ad', exact: true }).click();
    await expect(publication).toContainText('Your ad is online');
    expect((await page.request.get('/v1/listings/' + id)).status()).toBe(200);
    expect((await (await page.request.get('/v1/me/tutor')).json()).profile.identity_verified).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await info.attach(`unified-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await publication.getByRole('switch').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate this ad', exact: true }).click();
    await expect(publication).toContainText('Your ad is offline');
    expect((await page.request.get('/v1/listings/' + id)).status()).toBe(404);
    await publication.getByRole('switch').click();
    await expect(publication).toContainText('Your ad is online');
    await publication.getByRole('button', { name: 'Delete advert', exact: true }).click();
    const archived = page.waitForResponse(r => r.url().endsWith('/actions/ARCHIVE') && r.request().method() === 'POST');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete advert', exact: true }).click();
    expect((await archived).status()).toBe(200);
    expect((await page.request.get('/v1/listings/' + id)).status()).toBe(404);
    await expect.poll(async () => (await (await page.request.get('/v1/me/listings')).json()).listings.length).toBe(0);
  });
}
