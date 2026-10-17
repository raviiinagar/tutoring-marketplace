import {test,expect} from '@playwright/test';

test('served indexing documents block development crawlers and exclude private pages',async({request})=>{
  const robots=await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');
  expect(robots.headers()['cache-control']).toContain('no-store');
  const sitemap=await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain('<loc>');
  expect(sitemap.headers()['cache-control']).toContain('no-store');
  for(const path of ['/account','/staff/metrics','/requests']){
    const response=await request.get(path);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
