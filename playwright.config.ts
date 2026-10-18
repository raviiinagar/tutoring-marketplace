import {defineConfig} from '@playwright/test';
export default defineConfig({
  outputDir:process.env.PLAYWRIGHT_BUILT_UI==='true'?'.local/pilot-mobile-results':'test-results',
  reporter:[['list'],['json',{outputFile:process.env.PLAYWRIGHT_BUILT_UI==='true'?'.local/pilot-mobile-browser-results.json':'.local/pilot-browser-results.json'}]],
  testDir:'./tests/browser',workers:1,timeout:60_000,
  use:{baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3100',headless:true,trace:'retain-on-failure',...process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}},
  webServer:{command:'node scripts/browser-stack.mjs',url:process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3100',reuseExistingServer:false,timeout:120_000},
});
