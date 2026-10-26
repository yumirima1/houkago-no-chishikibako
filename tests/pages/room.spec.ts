import {test,expect} from '@playwright/test';
test('public static room renders real WebGL and loads all scene assets under the repository path',async({page,baseURL},info)=>{
  const errors:string[]=[],failures:string[]=[],assets=new Set<string>();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',r=>failures.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);if(r.url().endsWith('.glb')&&r.status()===200)assets.add(new URL(r.url()).pathname);});
  const response=await page.goto(baseURL!,{waitUntil:'networkidle'});
  expect(response?.status()).toBe(200);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0,{timeout:30000});
  await expect(page.getByText('この環境では3Dの部屋を表示できません。')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);
  const webgl=await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{
    const gl=canvas.getContext('webgl2');return {available:Boolean(gl),lost:gl?.isContextLost(),width:canvas.width,height:canvas.height,version:gl?.getParameter(gl.VERSION)};
  });
  expect(webgl.available).toBe(true);expect(webgl.lost).toBe(false);expect(webgl.width).toBeGreaterThan(1000);expect(webgl.height).toBeGreaterThan(500);
  expect(assets.size).toBeGreaterThanOrEqual(10);
  expect([...assets].every(a=>a.startsWith('/houkago-no-chishikibako/assets/observer-room/'))).toBe(true);
  expect(failures).toEqual([]);expect(errors).toEqual([]);
  const deployment=await page.request.get(new URL('deployment.json',baseURL!).href);expect(deployment.status()).toBe(200);
  const manifest=await deployment.json();if(process.env.GITHUB_SHA)expect(manifest.commit).toBe(process.env.GITHUB_SHA);
  await page.screenshot({path:info.outputPath('room.png'),fullPage:true});
  await info.attach('room',{path:info.outputPath('room.png'),contentType:'image/png'});
  await info.attach('render-evidence',{body:JSON.stringify({url:page.url(),manifest,webgl,assets:[...assets],errors,failures},null,2),contentType:'application/json'});
});
