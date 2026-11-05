import {execFileSync} from 'node:child_process';
import {needsFullPagesSuite} from '../src/lib/kousatsu/pages-test-scope.ts';
let full=true;
try{
  const paths=execFileSync('git',['diff','--name-only','-z','HEAD^','HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean);
  full=needsFullPagesSuite(paths,process.env.GITHUB_EVENT_NAME??'workflow_dispatch');
}catch{ /* Missing history retains the full suite. */ }
console.log(`full_ui=${full}`);
