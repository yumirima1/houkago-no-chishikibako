import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

// Build a small, explicitly selected frontend. Never move/remove local API routes,
// export private SQLite/Markdown, or alter the normal server build configuration.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const basePath=process.env.PAGES_BASE_PATH ?? '/houkago-no-chishikibako';
if(!/^\/[a-zA-Z0-9_-]+$/.test(basePath))throw Error('PAGES_BASE_PATH must be one repository path');
await mkdir('tmp',{recursive:true});
const stage=await mkdtemp(path.join(root,'tmp','pages-build-'));
for(const file of ['package.json','postcss.config.mjs'])await cp(path.join(root,file),path.join(stage,file));
for(const file of ['layout.tsx','globals.css','geist-fonts.css']) {
  let content=await readFile(path.join(root,'src/app',file),'utf8');
  content=content.replaceAll('/fonts/geist/',`${basePath}/fonts/geist/`);
  await mkdir(path.join(stage,'src/app'),{recursive:true});
  await writeFile(path.join(stage,'src/app',file),content);
}
await cp(path.join(root,'src/app/favicon.ico'),path.join(stage,'src/app/favicon.ico'));
await cp(path.join(root,'src/components/observer-room'),path.join(stage,'src/components/observer-room'),{recursive:true});
for(const file of ['runtime-types.ts','types.ts','quality-types.ts']){
  await mkdir(path.join(stage,'src/lib/kousatsu'),{recursive:true});
  await cp(path.join(root,'src/lib/kousatsu',file),path.join(stage,'src/lib/kousatsu',file));
}
for(const directory of ['assets/observer-room','fonts/geist'])await cp(path.join(root,'public',directory),path.join(stage,'public',directory),{recursive:true});
const page=`import { ObserverStudyRoot } from '@/components/observer-room/ObserverStudyRoot';\nexport const metadata = {title:'考察箱 | 観察者の部屋',description:'夜の街を望む静かな3Dの部屋。'};\nexport default function Page(){return <main style={{position:'fixed',inset:0,overflow:'hidden'}}><ObserverStudyRoot previewOnly /></main>;}\n`;
await writeFile(path.join(stage,'src/app/page.tsx'),page);
await mkdir(path.join(stage,'src/app/observer-room'),{recursive:true});
await writeFile(path.join(stage,'src/app/observer-room/page.tsx'),page);
const tsconfig=JSON.parse(await readFile(path.join(root,'tsconfig.json'),'utf8'));
tsconfig.include=['next-env.d.ts','src/**/*.ts','src/**/*.tsx','.next/types/**/*.ts'];tsconfig.exclude=['node_modules'];
await writeFile(path.join(stage,'tsconfig.json'),JSON.stringify(tsconfig,null,2));
await writeFile(path.join(stage,'next.config.mjs'),`export default ${JSON.stringify({output:'export',basePath,trailingSlash:true,images:{unoptimized:true},devIndicators:false,turbopack:{root},env:{NEXT_PUBLIC_BASE_PATH:basePath}})};\n`);
const build=spawnSync(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build',stage,'--webpack'],{cwd:root,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_BASE_PATH:basePath}});
if(build.status!==0)process.exit(build.status??1);
const output=path.join(stage,'out');
await writeFile(path.join(output,'.nojekyll'),'');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await writeFile(path.join(output,'deployment.json'),JSON.stringify({commit,basePath,builtAt:new Date().toISOString(),entry:'ObserverStudyRoot',previewOnly:true},null,2));
await writeFile('tmp/pages-artifact-path.txt',output);
if(process.env.GITHUB_OUTPUT){const {appendFile}=await import('node:fs/promises');await appendFile(process.env.GITHUB_OUTPUT,`path=${output}\n`);}
console.log(`Pages artifact: ${output}`);
