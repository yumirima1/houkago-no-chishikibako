import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/pages',timeout:60000,workers:1,retries:0,
  outputDir:'tmp/pages-browser',reporter:[['list'],['html',{outputFolder:'tmp/pages-browser-report',open:'never'}]],
  use:{baseURL:process.env.PAGES_TEST_URL??'http://127.0.0.1:4173/houkago-no-chishikibako/',viewport:{width:1440,height:900},
    reducedMotion:'reduce',screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{args:['--enable-unsafe-swiftshader'],...(process.env.PAGES_BROWSER_CHANNEL?{channel:process.env.PAGES_BROWSER_CHANNEL}:{})}},
  ...(process.env.PAGES_TEST_URL?{}:{webServer:{command:'node scripts/serve-pages.mjs',url:'http://127.0.0.1:4173/houkago-no-chishikibako/',reuseExistingServer:false,timeout:30000}}),
});
