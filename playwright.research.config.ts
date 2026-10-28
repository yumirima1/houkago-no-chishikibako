import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';
const artifactBasePath = () => {
 try { return JSON.parse(readFileSync('out/build-info.json','utf8')).basePath as string; }
 catch { return process.env.NEXT_PUBLIC_BASE_PATH ?? '/kousatsubako'; }
};
const localURL = `http://127.0.0.1:4177${artifactBasePath()}/`;
export default defineConfig({testDir:'tests/pages',workers:1,timeout:120000,retries:0,outputDir:'tmp/research-browser',reporter:[['list'],['html',{outputFolder:'tmp/research-browser-report',open:'never'}]],
 use:{baseURL:process.env.PAGES_TEST_URL??localURL,viewport:{width:1440,height:900},reducedMotion:'reduce',screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--enable-unsafe-swiftshader'],...(process.env.PAGES_BROWSER_CHANNEL?{channel:process.env.PAGES_BROWSER_CHANNEL}:{})}},
 ...(process.env.PAGES_TEST_URL?{}:{webServer:{command:'node scripts/serve-research-pages.mjs',url:localURL,timeout:30000}})});
