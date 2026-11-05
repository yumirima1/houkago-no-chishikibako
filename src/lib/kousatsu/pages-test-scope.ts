/** Static data/backend updates need the complete archive and reading contract.
 * Any unknown path, UI, dependency or asset change retains the full room suite. */
export function needsFullPagesSuite(paths:string[],event='push'){
  if(event!=='push'||!paths.length)return true;
  return paths.some(p=>!(p.startsWith('public/research/')||p.startsWith('src/lib/kousatsu/')||p.startsWith('tests/kousatsu/')||p.startsWith('docs/')||
    /^config\/kousatsu-[^/]+\.json$/.test(p)||/^scripts\/(?:kousatsu-backend\.ts|validate-research-quality\.ts|review-research-consistency\.ts|pages-test-scope\.mjs)$/.test(p)||p==='.github/workflows/pages.yml'));
}
