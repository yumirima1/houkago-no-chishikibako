import {test,expect} from '@playwright/test';
import {readableTitle} from '../../src/components/observer-room/terminalFormat';
import {mockWeather,roomReady,seedRoom} from './room-support';

test('every saved public consideration is listed, opens by its own ID, and has matching JSON and Markdown',async({page,baseURL},info)=>{
 test.setTimeout(240000);
 await seedRoom(page);await mockWeather(page,false);await roomReady(page,baseURL!);
 const response=await page.request.get(new URL('research/snapshot.json',baseURL!).href);expect(response.ok()).toBe(true);
 const snapshot=await response.json(),ids=snapshot.notes.map((n:{id:string})=>n.id);
 expect(ids.length).toBeGreaterThan(0);expect(new Set(ids).size).toBe(ids.length);expect(snapshot.archive.saved).toBe(ids.length);
 await page.getByRole('region',{name:'観察者の部屋',exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'考察アーカイブ',exact:true}).click();
 const list=page.locator('[aria-label="考察一覧"]');await expect(list).toBeVisible();
 await expect(list.locator('[data-record-id]')).toHaveCount(ids.length);
 const checked:string[]=[];
 for(const id of ids){
  const json=await page.request.get(new URL(`research/notes/${id}.json`,baseURL!).href),md=await page.request.get(new URL(`research/notes/${id}.md`,baseURL!).href);
  expect(json.ok(),id).toBe(true);expect(md.ok(),id).toBe(true);const note=await json.json();
  expect(note.id).toBe(id);expect((await md.text()).replaceAll('\r\n','\n')).toBe(note.markdown.replaceAll('\r\n','\n'));
  const row=list.locator(`[data-record-id="${id}"]`);await row.scrollIntoViewIfNeeded();await row.click();
  await expect(page.locator('[data-document-content]')).toBeVisible();
  await expect(page.getByRole('heading',{level:1,name:readableTitle(note.title),exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Markdownをダウンロード ↓',exact:true})).toHaveAttribute('href',new RegExp(`${id}\\.md$`));
  if(note.validationLabel)await expect(page.locator('[data-document-content]')).toContainText(note.validationLabel);
  if(Array.isArray(note.evidence))for(const evidence of note.evidence){
    await expect(page.locator('[data-document-content]')).toContainText(evidence.claimId);
    await expect(page.locator('[data-document-content]')).toContainText(evidence.versionId);
  }
  checked.push(id);await page.getByRole('button',{name:'一覧に戻る',exact:true}).click();await expect(list).toBeVisible();
 }
 await info.attach('complete-archive-coverage',{body:JSON.stringify({url:baseURL,expected:ids.length,checked,duplicates:0}),contentType:'application/json'});
 await page.screenshot({path:info.outputPath('complete-archive.png')});
});
