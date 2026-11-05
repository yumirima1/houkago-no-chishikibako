import test from 'node:test';import assert from 'node:assert/strict';
import {needsFullPagesSuite} from '../../src/lib/kousatsu/pages-test-scope';
test('data and backend changes retain archive checks without rerunning unrelated room behavior',()=>{
 assert.equal(needsFullPagesSuite(['public/research/snapshot.json','public/research/notes/a.json']),false);
 assert.equal(needsFullPagesSuite(['src/lib/kousatsu/ai.ts','tests/kousatsu/model-repair.test.ts','config/kousatsu-backend.json']),false);
});
test('UI, asset, dependency and unknown changes require the complete browser suite',()=>{
 for(const p of ['src/app/page.tsx','src/components/observer-room/ObserverDesktop.tsx','public/assets/observer-room/a.glb','package-lock.json','next.config.ts','tests/pages/traffic.spec.ts','scripts/build-pages.mjs','unknown.txt'])assert.equal(needsFullPagesSuite(['public/research/snapshot.json',p]),true,p);
});
test('manual runs and incomplete history keep the full browser suite',()=>{
 assert.equal(needsFullPagesSuite([]),true);assert.equal(needsFullPagesSuite(['public/research/snapshot.json'],'workflow_dispatch'),true);
});
