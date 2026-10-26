// Real React DOM / StrictMode regression probe. jsdom provides a DOM, not a
// rendering browser: this does not verify WebGL, audio playback, or layout.
// Install matching react/react-dom and jsdom in a separate directory, then run:
// node scripts/verify-observation-react.mjs --dependencies <isolated-directory>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const dependencies = process.argv[process.argv.indexOf('--dependencies') + 1];
if (!dependencies || !process.argv.includes('--dependencies')) throw new Error('--dependencies is required');
const requireDependencies = createRequire(path.resolve(dependencies, 'package.json'));
const React = requireDependencies('react');
const { createRoot } = requireDependencies('react-dom/client');
const { JSDOM } = requireDependencies('jsdom');
assert.equal(React.version, JSON.parse(readFileSync('node_modules/react/package.json', 'utf8')).version);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const keys = {
  logs: 'houkago.observation.logs', relationships: 'houkago.observation.relationships',
  subject: 'houkago.observation.selectedSubject', operation: 'houkago.observation.operation.v1.',
};
const oldLog = { id:'existing-log', actionId:'saved', source:'observe', subjectId:'kana',
  thought:'Existing history', timestamp:'2026-01-01T00:00:00.000Z' };
const relationships = { kana:{trust:90,friendship:80,dependency:60},tartar:{trust:85,friendship:70,dependency:50} };

class MemoryStorage {
  values = new Map();
  writes = [];
  failRead = '';
  failWrite = '';
  constructor(existing = true) {
    if (existing) {
      this.values.set(keys.logs, JSON.stringify([oldLog]));
      this.values.set(keys.relationships, JSON.stringify(relationships));
      this.values.set(keys.subject, 'kana');
    }
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) {
    if (this.failRead && key.startsWith(this.failRead)) throw new Error('Simulated read failure');
    return this.values.get(key) ?? null;
  }
  setItem(key,value) {
    if (this.failWrite && key.startsWith(this.failWrite)) throw new Error('Simulated write failure');
    this.writes.push(key);this.values.set(key,value);
  }
}

async function harness({ existing=true, storage=new MemoryStorage(existing), kind='room',
  controller, scene={fails:true,webglThrows:false}, fetcher=async()=>({ok:false,json:async()=>({error:'Unavailable fixture'})}) }={}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
    {url:'http://localhost/',pretendToBeVisual:true});
  const originalGlobals = new Map();
  for (const [name,value] of Object.entries({window:dom.window,document:dom.window.document,
    navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement})) {
    originalGlobals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  }
  const {window} = dom;
  Object.defineProperty(window,'localStorage',{value:storage,configurable:true});
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  if(kind==='scene')window.HTMLCanvasElement.prototype.getContext=()=>{
    if(scene.webglThrows)throw new Error('Simulated context creation failure');
    return {};
  };
  window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
  const timers=new Map();let nextTimer=0;
  const originalTimeout=window.setTimeout.bind(window),originalClear=window.clearTimeout.bind(window);
  window.setTimeout=(callback,delay,...args)=>{
    if (delay===0) {const id=--nextTimer;timers.set(id,()=>callback(...args));return id;}
    return originalTimeout(callback,delay,...args);
  };
  window.clearTimeout=(id)=>{if(id<0)timers.delete(id);else originalClear(id);};
  class FakeAudio {
    volume=0;paused=true;currentTime=0;
    addEventListener(){} removeEventListener(){} pause(){this.paused=true;} async play(){this.paused=false;}
  }
  const context=vm.createContext({URLSearchParams,window,document:window.document,
    HTMLElement:window.HTMLElement,AbortController,Audio:FakeAudio,fetch:fetcher,console,setTimeout,clearTimeout,
    process:{env:{NEXT_PUBLIC_OBSERVATION_ROOM_3D:'1'}}});
  let state,bgm,ambience,runtime;
  const cache=new Map();
  const views=new Set(['AmbientSoundControls','BgmControls','Clock','EpisodeList','room/RoomSceneRoot']);
  function load(relative) {
    const filename=path.resolve(relative);
    if(cache.has(filename))return cache.get(filename);
    const exports={};cache.set(filename,exports);
    const output=ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const requireModule=(specifier)=>{
      if(specifier==='next/link') return {__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)};
      if(specifier==='react')return React;
      if(specifier==='react/jsx-runtime')return requireDependencies(specifier);
      if(specifier==='next/dynamic')return {default:()=>function SceneFixture(){
        if(scene.fails)throw new Error('Simulated model import/load failure');
        return React.createElement('div',{'data-testid':'recovered-3d'},'3D fixture recovered');
      }};
      if(specifier==='./generatedEpisodes')return {generatedEpisodes:[]};
      if(views.has(specifier.replace('@/components/','')))return new Proxy({}, {get:()=>()=>null});
      if(specifier==='@/components/kousatsu/ResearchConsole' && kind==='room')return {ResearchConsole:()=>null};
      if(specifier==='@/components/kousatsu/useResearchRuntime' && kind==='room') {
        return {useResearchRuntime:()=>({snapshot:null,error:null,busy:false})};
      }
      if(specifier==='@/components/observation/useObservationState') {
        return {useObservationState:()=>{state=load('src/components/observation/useObservationState.ts').useObservationState();return state;}};
      }
      if(specifier==='@/hooks/useAmbientAudio')return {useAmbientAudio:(options)=>{
        bgm=load('src/hooks/useAmbientAudio.ts').useAmbientAudio(options);return bgm;}};
      if(specifier==='@/hooks/useBroadcastAmbience')return {useBroadcastAmbience:(options)=>{
        ambience=load('src/hooks/useBroadcastAmbience.ts').useBroadcastAmbience(options);return ambience;}};
      if(specifier.startsWith('@/')) {
        const base=path.join('src',specifier.slice(2));
        try{return load(base+'.ts');}catch(error){if(error.code==='ENOENT')return load(base+'.tsx');throw error;}
      }
      throw new Error('Unexpected probe dependency: '+specifier);
    };
    new vm.Script('(function(require,exports){'+output+'\n})',{filename}).runInContext(context)(requireModule,exports);
    return exports;
  }
  const episode={id:'episode-005',title:'Fixture',description:'No real assets',duration:'01:00',publishedAt:'2026-01-01',
    productionStatus:'published',speakers:{science:'A',humanities:'B'},themes:[]};
  const caughtErrors=[];
  const root=createRoot(window.document.getElementById('root'),{onCaughtError:(error)=>caughtErrors.push(error.message)});
  let element;
  if(kind==='room')element=React.createElement(load('src/components/ListeningRoom.tsx').ListeningRoom,{episodes:[episode]});
  else if(kind==='runtime') {
    const useRuntime=load('src/components/kousatsu/useResearchRuntime.ts').useResearchRuntime;
    const Probe=()=>{runtime=useRuntime();return React.createElement('p',null,runtime.error ?? 'ready');};
    element=React.createElement(Probe);
  } else if(kind==='scene') {
    const engine=load('src/components/observation/subjectEngine.ts');
    element=React.createElement(load('src/components/room/RoomSceneRoot.tsx').RoomSceneRoot,{
      action:engine.getSubjectAction('kana'),broadcastCandidates:[],isPlaying:false,isScreensaver:false,
      latestEpisode:episode,logs:[],onInspectObject:(id)=>scene.inspected=id,subject:engine.observationSubjects.kana,timeStateLabel:'fixture',
    });
  } else element=React.createElement(load('src/components/kousatsu/ResearchConsole.tsx').ResearchConsole,{research:controller});
  await React.act(async()=>root.render(React.createElement(React.StrictMode,null,element)));
  return {storage,window,get state(){return state;},get bgm(){return bgm;},get ambience(){return ambience;},get runtime(){return runtime;},
    caughtErrors,
    async hydrate(){await React.act(async()=>{for(const [id,callback] of [...timers]){timers.delete(id);callback();}});},
    async act(callback){await React.act(callback);},
    async renderResearch(nextController){await React.act(async()=>root.render(React.createElement(React.StrictMode,null,
      React.createElement(load('src/components/kousatsu/ResearchConsole.tsx').ResearchConsole,{research:nextController}))));},
    async close(){await React.act(async()=>root.unmount());dom.window.close();
      for(const [name,descriptor] of originalGlobals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
  };
}

const results=[];
async function check(name,operation) {
  try {await operation();results.push({name,status:'passed'});}
  catch(error) {results.push({name,status:'failed',error:error.message});}
}

await check('StrictMode retains existing history and never writes before hydration',async()=>{
  const h=await harness();try {
    assert.equal(h.state.hydrated,false);assert.equal(h.storage.writes.length,0);
    await h.hydrate();assert.equal(h.state.selectedSubjectId,'kana');assert.equal(h.state.logs[0].id,oldLog.id);
    assert.equal(h.state.relationships.kana.trust,90);assert.equal(h.storage.writes.length,0);
    await h.act(async()=>{h.state.recordObservation('kana','observe');h.state.recordObservation('kana','dialogue');});
    assert.equal(h.state.logs.length,3);assert.equal(h.state.logs[0].source,'dialogue');
    assert.equal(h.state.relationships.kana.trust,94);
    assert.equal(h.storage.writes.filter((key)=>key.startsWith(keys.operation)).length,2);
  } finally {await h.close();}
});

await check('StrictMode initial visit is persisted once and reload preserves later actions',async()=>{
  const storage=new MemoryStorage(false);let h=await harness({storage});
  try {await h.hydrate();assert.equal(h.state.logs.length,1);
    await h.act(async()=>h.state.recordObservation('tartar','dialogue'));assert.equal(h.state.logs.length,2);
  } finally {await h.close();}
  h=await harness({storage});try {await h.hydrate();assert.equal(h.state.logs.length,2);
    assert.equal(storage.writes.filter((key)=>key.startsWith(keys.operation)).length,2);
  } finally {await h.close();}
});

await check('quota failure preserves complete old state; successful retry commits exactly once',async()=>{
  const h=await harness();try {await h.hydrate();h.storage.failWrite=keys.operation;
    await h.act(async()=>h.state.selectSubject('tartar'));
    assert.ok(h.state.storageError);assert.equal(h.state.selectedSubjectId,'kana');assert.equal(h.state.logs.length,1);
    assert.ok(h.window.document.querySelector('[role="alert"]'));
    h.storage.failWrite='';await h.act(async()=>h.state.selectSubject('tartar'));
    assert.equal(h.state.storageError,null);assert.equal(h.state.logs.length,2);
  } finally {await h.close();}
});

await check('a committed operation survives a subsequent read failure without duplicate retry',async()=>{
  const h=await harness();try {await h.hydrate();
    const originalSet=h.storage.setItem.bind(h.storage);
    h.storage.setItem=(key,value)=>{originalSet(key,value);if(key.startsWith(keys.operation))h.storage.failRead='houkago';};
    await h.act(async()=>h.state.recordObservation('kana','dialogue'));
    assert.equal(h.state.logs.length,2);assert.equal(h.state.hydrated,false);assert.ok(h.state.storageError);
    await h.act(async()=>assert.equal(h.state.recordObservation('kana','dialogue'),null));
    assert.equal(h.storage.writes.filter((key)=>key.startsWith(keys.operation)).length,1);
    h.storage.failRead='';await h.act(async()=>h.state.reloadStoredState());
    assert.equal(h.state.logs.length,2);assert.equal(h.state.hydrated,true);assert.equal(h.state.storageError,null);
  } finally {await h.close();}
});

await check('corrupt observation storage is retained and never replaced by defaults',async()=>{
  const storage=new MemoryStorage();storage.values.set(keys.logs,'{broken');
  const original=[...storage.values];const h=await harness({storage});try {await h.hydrate();
    assert.equal(h.state.hydrated,false);assert.ok(h.state.storageError);
    await h.act(async()=>h.state.selectSubject('tartar'));assert.deepEqual([...storage.values],original);
    assert.equal(storage.writes.length,0);
    storage.values.set(keys.logs,JSON.stringify([oldLog]));
    const retry=[...h.window.document.querySelectorAll('button')].find((entry)=>entry.textContent.includes('保存状態を再読込'));
    assert.ok(retry);await h.act(async()=>retry.click());
    assert.equal(h.state.hydrated,true);assert.equal(h.state.logs[0].id,oldLog.id);
    assert.equal(h.state.storageError,null);assert.equal(storage.writes.length,0);
  } finally {await h.close();}
});

await check('denied storage reads do not crash the room or overwrite audio preferences',async()=>{
  const storage=new MemoryStorage();storage.failRead='houkago';const original=[...storage.values];
  const h=await harness({storage});try {await h.hydrate();
    assert.equal(h.state.hydrated,false);assert.ok(h.state.storageError);assert.ok(h.bgm.storageError);assert.ok(h.ambience.storageError);
    assert.deepEqual([...storage.values],original);assert.equal(storage.writes.length,0);
  } finally {await h.close();}
});

await check('audio preference writes fail visibly and malformed preferences are preserved',async()=>{
  const h=await harness();try {await h.hydrate();h.storage.failWrite='houkago:';
    await h.act(async()=>{h.bgm.setVolume(0.03);h.ambience.setVolume('rain',0.08);});
    assert.ok(h.bgm.storageError);assert.ok(h.ambience.storageError);
    assert.equal(h.bgm.volume,0.03);assert.equal(h.ambience.volumes.rain,0.08);
  } finally {await h.close();}
  const storage=new MemoryStorage();storage.values.set('houkago:bgm-volume','NaN');
  storage.values.set('houkago:ambience-volume:rain','garbage');const original=[...storage.values];
  const second=await harness({storage});try {await second.hydrate();
    assert.ok(second.bgm.storageError);assert.ok(second.ambience.storageError);assert.deepEqual([...storage.values],original);
  } finally {await second.close();}
});

await check('saved audio preferences survive early changes and StrictMode loading without automatic writes',async()=>{
  const storage=new MemoryStorage();storage.values.set('houkago:bgm-enabled','true');
  storage.values.set('houkago:bgm-volume','0.09');storage.values.set('houkago:ambience-enabled','false');
  storage.values.set('houkago:ambience-volume:wind','0.13');
  const original=[...storage.values];const h=await harness({storage});try {
    await h.act(async()=>{h.bgm.setVolume(0.01);h.ambience.setVolume('wind',0.01);});
    assert.equal(storage.writes.length,0);await h.hydrate();
    assert.equal(h.bgm.enabled,true);assert.equal(h.bgm.volume,0.09);assert.equal(h.ambience.volumes.wind,0.13);
    assert.deepEqual([...storage.values],original);
  } finally {await h.close();}
});

await check('room hint read/write failures cannot block observation interactions',async()=>{
  for(const failure of ['read','write']) {
    const storage=new MemoryStorage();
    if(failure==='read')storage.failRead='houkago.roomHint';
    const h=await harness({storage});try {await h.hydrate();
      if(failure==='write')storage.failWrite='houkago.roomHint';
      const button=h.window.document.querySelector('.room-object-hotspot-terminal');
      assert.ok(button);await h.act(async()=>button.click());
      assert.equal(h.state.logs.length,2);assert.equal(h.state.logs[0].source,'room-object');
      assert.ok(h.window.document.querySelector('.subject-room-overlay [role="status"]'));
      assert.equal(storage.values.has('houkago.roomHint.kana'),false);
    } finally {await h.close();}
  }
});

const snapshot={initialized:true,sources:[{id:'source-a',name:'Source A',enabled:true,topic:'Example topic'}],
  jobs:[],notes:[{id:'note-1',title:'First',createdAt:'2026-01-01T00:00:00Z'},
    {id:'note-2',title:'Second',createdAt:'2026-01-02T00:00:00Z'}],interests:[],memories:[]};
const note=(id,markdown)=>({id,markdown,artifact:'matching',verification:{status:'passed',factCheckStatus:'unverified'}});
function deferred() {let resolve;const promise=new Promise((complete)=>{resolve=complete;});return {promise,resolve};}
const response=(data,ok=true)=>({ok,json:async()=>data});

await check('ResearchConsole selects notes and ignores stale responses; Markdown is escaped as text',async()=>{
  const pending=[];
  const controller={snapshot,error:null,busy:false,act:async()=>{},run:async()=>{}};
  const h=await harness({kind:'console',controller,fetcher:(url,options)=>{
    const request={url,options,...deferred()};pending.push(request);return request.promise;
  }});
  try {
    const selector=[...h.window.document.querySelectorAll('select')].find((select)=>
      [...select.options].some((option)=>option.value==='note-2'));
    assert.ok(selector);
    await h.act(async()=>{selector.value='note-2';selector.dispatchEvent(new h.window.Event('change',{bubbles:true}));});
    const latest=pending.at(-1);assert.ok(latest.url.endsWith('note-2'));
    await h.act(async()=>latest.resolve(response(note('note-2','# Second\n<script>window.bad=true</script>'))));
    assert.match(h.window.document.querySelector('pre').textContent,/# Second/);
    assert.equal(h.window.document.querySelectorAll('script').length,0);
    assert.equal(h.window.bad,undefined);
    for(const old of pending.slice(0,-1)) {
      await h.act(async()=>old.resolve(response(note('note-1','# Stale first note'))));
    }
    assert.match(h.window.document.querySelector('pre').textContent,/# Second/);
    assert.ok(h.window.document.querySelector('a[download]').getAttribute('href').includes('note-2'));
    await h.act(async()=>{selector.value='note-1';selector.dispatchEvent(new h.window.Event('change',{bubbles:true}));});
    await h.act(async()=>pending.at(-1).resolve(response({error:'Note fixture unavailable'},false)));
    assert.ok(h.window.document.querySelector('[role="alert"]'));
    assert.equal(h.window.document.querySelector('pre'),null);
  } finally {await h.close();}
});

await check('ResearchConsole submits the selected source and safely handles action rejection',async()=>{
  const calls=[];
  const controller={snapshot,error:'Fixture action failed',busy:false,
    act:async(action)=>{calls.push(action);throw new Error('Expected fixture failure');},
    run:async(source,topic)=>{calls.push({source,topic});}};
  const h=await harness({kind:'console',controller,fetcher:async(url)=>response(note(
    new URL(url,'http://localhost').searchParams.get('note'),'# Note fixture'))});
  try {
    await h.act(async()=>h.window.document.querySelector('form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(calls[0],{source:'source-a',topic:''});
    const button=[...h.window.document.querySelectorAll('button')].find((entry)=>entry.textContent.includes('待機'));
    assert.ok(button);await h.act(async()=>button.click());
    assert.equal(calls.at(-1).action,'tick');
    assert.match(h.window.document.querySelector('[role="alert"]').textContent,/Fixture action failed/);
  } finally {await h.close();}
});

await check('runtime polling ignores old responses and preserves the latest snapshot on error',async()=>{
  const pending=[];
  const h=await harness({kind:'runtime',fetcher:(url,options)=>{
    const request={url,options,...deferred()};pending.push(request);return request.promise;
  }});
  try {
    let refresh;
    await h.act(async()=>{refresh=h.runtime.refresh();});
    const latest={...snapshot,initialized:true,marker:'latest'};
    await h.act(async()=>pending.at(-1).resolve(response(latest)));await refresh;
    assert.equal(h.runtime.snapshot.marker,'latest');
    for(const old of pending.slice(0,-1)) await h.act(async()=>old.resolve(response({...snapshot,marker:'old'})));
    assert.equal(h.runtime.snapshot.marker,'latest');
    let failed;
    await h.act(async()=>{failed=h.runtime.refresh();});
    await h.act(async()=>pending.at(-1).resolve(response({error:'Refresh failed'},false)));await failed;
    assert.ok(h.runtime.error);assert.equal(h.runtime.snapshot.marker,'latest');
  } finally {await h.close();}
});

await check('the runtime prevents duplicate enqueue when run is invoked twice before a render',async()=>{
  const posts=[];
  const h=await harness({kind:'runtime',fetcher:async(url,options)=>{
    if(options?.method!=='POST')return response(snapshot);
    const request={action:JSON.parse(options.body),...deferred()};posts.push(request);return request.promise;
  }});
  let first,second;
  try {
    await h.act(async()=>{
      first=h.runtime.run('source-a','same topic');first.catch(()=>{});
      second=h.runtime.run('source-a','same topic');second.catch(()=>{});
    });
    assert.equal(posts.length,1,'one pending enqueue expected before the initial POST completes');
  } finally {
    for(let attempt=0;attempt<6;attempt++) {
      const pending=posts.filter((entry)=>!entry.done);
      if(!pending.length)break;
      await h.act(async()=>{for(const entry of pending){entry.done=true;entry.resolve(response({status:'completed',jobId:'fixture'}));}});
    }
    await Promise.allSettled([first,second]);await h.close();
  }
});

await check('HTTP 200 blocked/retry_wait pipeline outcomes remain visible as action errors',async()=>{
  for(const status of ['blocked','retry_wait']) {
    const h=await harness({kind:'runtime',fetcher:async(url,options)=>response(options?.method==='POST'
      ? {status,error:'ARTIFACT_CONFLICT: fixture diagnosis'}:snapshot)});
    try {
      await h.act(async()=>{await h.runtime.act({action:'tick'}).catch(()=>{});});
      assert.ok(h.runtime.error,`${status} must not be shown as a successful action`);
    } finally {await h.close();}
  }
});

await check('an unchanged note selection refreshes artifact status after a runtime snapshot update',async()=>{
  let artifact='missing';let reads=0;
  const controller={snapshot,error:null,busy:false,act:async()=>{},run:async()=>{}};
  const h=await harness({kind:'console',controller,fetcher:async(url)=>{
    reads++;return response({...note(new URL(url,'http://localhost').searchParams.get('note'),'# Preserved Markdown'),artifact});
  }});
  try {
    assert.ok(h.window.document.body.textContent.includes('欠落（DBに正本あり）'));
    const before=reads;artifact='matching';
    await h.renderResearch({...controller,snapshot:{...snapshot,jobs:[{id:'restored',topic:'Restored',status:'succeeded',queue:'done'}]}});
    assert.ok(reads>before,'same note must be rechecked after artifact restoration');
    assert.ok(h.window.document.body.textContent.includes('保存ファイル: DBと一致'));
  } finally {await h.close();}
});

await check('a 3D child load failure switches to interactive 2D and can retry successfully',async()=>{
  const scene={fails:true,webglThrows:false};const h=await harness({kind:'scene',scene});
  try {
    await h.hydrate();assert.ok(h.caughtErrors.some((error)=>error.includes('Simulated model')));
    assert.ok(h.window.document.querySelector('.subject-room-scene'));
    const terminal=h.window.document.querySelector('.room-object-terminal');assert.ok(terminal);
    await h.act(async()=>terminal.click());assert.equal(scene.inspected,'terminal');
    const retry=[...h.window.document.querySelectorAll('button')].find((entry)=>entry.textContent.includes('3Dを再試行'));
    assert.ok(retry);scene.fails=false;await h.act(async()=>retry.click());
    assert.ok(h.window.document.querySelector('[data-testid="recovered-3d"]'));
  } finally {await h.close();}
});

await check('a WebGL context creation exception safely selects 2D',async()=>{
  const scene={fails:false,webglThrows:true};const h=await harness({kind:'scene',scene});
  try {await h.hydrate();assert.ok(h.window.document.querySelector('.subject-room-scene'));}
  finally {await h.close();}
});

console.log(JSON.stringify({react:React.version,dom:'jsdom (not a rendering browser)',results},null,2));
if(results.some((result)=>result.status==='failed'))process.exitCode=1;
