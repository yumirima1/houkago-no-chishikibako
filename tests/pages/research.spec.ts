import {test,expect} from '@playwright/test';
test('the real public archive opens in the CRT, displays saved research and sources, and refreshes safely',async({page,baseURL},info)=>{
 const errors:string[]=[],failed:string[]=[],api:string[]=[],assets=new Set<string>();
 // Weather has its own tests. Keep the research test independent of forecast availability.
 await page.route('https://api.open-meteo.com/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current:{time:new Date().toISOString().slice(0,16),temperature_2m:20,weather_code:0,wind_speed_10m:0,is_day:0},utc_offset_seconds:32400,timezone:'Asia/Tokyo'})}));
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))api.push(r.url());});
 page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failed.push(r.url());});page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);if(r.url().endsWith('.glb')&&r.ok())assets.add(r.url());});
 expect((await page.goto(baseURL!,{waitUntil:'domcontentloaded'}))?.status()).toBe(200);await expect(page.locator('canvas')).toBeVisible();await expect(page.getByText('部屋を準備しています…',{exact:true})).toHaveCount(0,{timeout:30000});
 const gl=await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{const g=canvas.getContext('webgl2');return Boolean(g&&!g.isContextLost());});expect(gl).toBe(true);expect(assets.size).toBeGreaterThanOrEqual(14);await page.screenshot({path:info.outputPath('room.png')});
 const res=await page.request.get(new URL('research/snapshot.json',baseURL!).href);expect(res.status()).toBe(200);const snapshot=await res.json();expect(snapshot.notes.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'CRTモニターを開く'}).focus();await page.keyboard.press('Enter');await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible();
 await page.getByRole('button',{name:'考察アーカイブ',exact:true}).click();await page.getByRole('button',{name:new RegExp(snapshot.notes[0].title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
 const note=await (await page.request.get(new URL(`research/notes/${snapshot.notes[0].id}.json`,baseURL!).href)).json();await expect(page.locator('pre')).toContainText(note.markdown);await expect(page.locator('pre')).toContainText('推論');await expect(page.locator('pre')).toContainText('修正する条件');
 await page.screenshot({path:info.outputPath('archive.png')});await page.getByRole('button',{name:'再読込',exact:true}).click();await expect(page.getByText(snapshot.notes[0].title,{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'収集ニュース',exact:true}).click();await page.getByRole('button',{name:new RegExp(snapshot.news[0].title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();await expect(page.getByRole('link',{name:'元の記事を開く'})).toHaveAttribute('href',snapshot.news[0].url);
 await page.getByRole('button',{name:'システム',exact:true}).click();await expect(page.getByText('06:00 / 18:00 / 22:00',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('system.png')});
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('canvas')).toBeVisible();await expect(page.getByText('部屋を準備しています…',{exact:true})).toHaveCount(0,{timeout:30000});
 await page.getByRole('button',{name:'CRTモニターを開く'}).focus();await page.keyboard.press('Enter');await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible();
 await page.getByRole('button',{name:'考察アーカイブ',exact:true}).click();
 await page.getByRole('button').filter({has:page.getByText(snapshot.notes[0].title,{exact:true})}).click();await expect(page.locator('pre')).toContainText(note.markdown);
 for(const source of note.sources??[])await expect(page.getByRole('link',{name:`出典: ${source.title} ↗`,exact:true})).toHaveAttribute('href',source.url);
 expect(api).toEqual([]);expect(failed).toEqual([]);expect(errors).toEqual([]);
 await info.attach('research-render',{body:JSON.stringify({url:page.url(),notes:snapshot.notes.map((n:{id:string;title:string})=>({id:n.id,title:n.title})),assets:assets.size,api,errors,failed}),contentType:'application/json'});
});
