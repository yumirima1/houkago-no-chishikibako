import { lstat, mkdir, readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { contentDigest, publishArtifact } from './artifact-store';
import { autonomousPaths, type AutonomousConfig } from './autonomous-config';
import type { TopicHistory } from './research-engine';
import type { AnalysisResult } from './types';

const line=(v: unknown) => String(v ?? '').replace(/\s+/g,' ').replace(/[\[\]]/g,'').trim();
type Row=Record<string,unknown>;

/** Immutable, versioned exports: a new evaluation never replaces an edited file. */
export async function exportKnowledge(config: AutonomousConfig, history: TopicHistory) {
  const paths=autonomousPaths(config);
  const db=new DatabaseSync(paths.database,{readOnly:true});
  const own=(file: string) => {
    const rel=path.relative(paths.root,file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('KNOWLEDGE_PATH_OUTSIDE_ROOT');
  };
  const remember=(file: string, lines: string[], jobId?: string) => {own(file);history.manifest(file,lines.join('\n')+'\n',jobId);};
  try {
    const versions=db.prepare('SELECT * FROM item_versions ORDER BY id').all() as Row[];
    const hasContent=Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name='research_content_provenance'").get());
    for (const v of versions) {
      const coverage=hasContent ? db.prepare('SELECT coverage_json FROM research_content_provenance WHERE version_id=?').get(String(v.id)) : null;
      const isBody=coverage && JSON.parse(String(coverage.coverage_json)).kind==='article-body';
      remember(path.join(paths.articles,`${v.item_id}-${v.id}.md`),[
        `# ${line(v.title)}`, '', `取得日時: ${line(v.fetched_at)}`, `文書ID: ${v.item_id}`,`保存版: ${v.id}`,`SHA-256: ${v.content_hash}`, '',
        '## 出典（独立確認前）','',`- ${line(v.source_id)}: ${v.url} / 取得: ${v.fetched_at}`,'',
        '## 情報源の記述','',line(isBody ? v.content : v.summary || v.content || v.title),'',
        '## 不確実性','', '配信元による記述。タイトルのみの保存では記事本文を確認していません。独立した事実確認は未実施。',
      ]);
    }
    const articles=db.prepare('SELECT * FROM articles WHERE output_path IS NOT NULL').all() as Row[];
    for (const article of articles) {
      const output=String(article.output_path);
      // Existing legacy artifacts remain where they are. A local mirror is additive.
      const file=path.relative(paths.notes,output).startsWith('..') ? path.join(paths.notes,`legacy-${article.id}.md`) : output;
      own(file);history.manifest(file,String(article.markdown),String(article.job_id));
      const verification=db.prepare("SELECT data_json FROM checkpoints WHERE job_id=? AND stage='verify'").get(String(article.job_id));
      if (verification) history.manifest(file.replace(/\.md$/,'.verification.json'),JSON.stringify(JSON.parse(String(verification.data_json)),null,2)+'\n',String(article.job_id));
    }
    const memories=db.prepare('SELECT * FROM research_memory_events ORDER BY id').all() as Row[];
    for (const memory of memories) {
      const references=JSON.parse(String(memory.references_json)) as Array<{itemId:string;versionId:string;claimIds:string[]}>;
      const note=articles.find(a=>a.id===memory.article_id);
      remember(path.join(memory.kind==='hypothesis' ? paths.hypotheses : paths.memory,`${memory.id}.md`),[
        `# ${memory.kind==='hypothesis' ? '未確認の仮説' : '過去の解釈'}: ${line(memory.topic)}`, '',
        `作成日時: ${memory.created_at}`,`記憶ID: ${memory.id}`,`ジョブID: ${memory.job_id}`,`状態: ${memory.verification_status} / ${memory.fact_check_status}`, '',
        '## 解釈・仮説', '',String(memory.text),'','## 評価理由','',String(memory.reason),'',
        '## 根拠資料（論理的支持は未確認）','',...references.map(r=>`- [保存文書](../Articles/${r.itemId}-${r.versionId}.md) / claim: ${r.claimIds.join(', ')}`),'',
        '## 関連ノート','',...(note ? [`- [考察](../Notes/${path.basename(String(note.output_path))})`] : []),'',
        '## 反証・未確認事項','', '反証の成立と情報源の独立性は未確認。根拠の改訂履歴は revision-*.md を参照。',
      ],String(memory.job_id));
      const saved=db.prepare("SELECT data_json FROM checkpoints WHERE job_id=? AND stage='analyze'").get(String(memory.job_id));
      const quality=saved ? (JSON.parse(String(saved.data_json)) as AnalysisResult).quality : null;
      if(memory.kind==='interpretation'&&quality?.reflection) {
        const view=quality.reflection;
        remember(path.join(paths.memory,`view-${memory.id}.md`),[
          '# 更新可能な見解（推論）','',`記憶: ${memory.id}`,`記録: ${memory.created_at}`,`ジョブ: ${memory.job_id}`,'',
          `問題: ${line(view.issue)}`,'',`見解: ${line(view.position)}`,'',`理由: ${line(view.reasoning)}`,'',
          `暫定的な確信度: ${view.confidence}（事実確認の確率ではない）`,'',`別の説明: ${line(view.alternative)}`,'',
          `修正条件: ${line(view.revisionCondition)}`,'',`仮定: ${view.assumptions.map(line).join(' / ')}`,'',
          `反対材料の主張ID: ${(view.counterClaimIds??[]).join(', ') || '対応する原文はまだない'}`,'',
          '反対材料・後の評価: view-review-*.mdを参照。未観測の結果は補わない。','',
          ...references.map(r=>`- [根拠文書](../Articles/${r.itemId}-${r.versionId}.md) / 版 ${r.versionId} / claim ${r.claimIds.join(', ')}`),'',
          ...(note?[`[ノート](../Notes/${path.basename(String(note.output_path))})`]:[]),
        ],String(memory.job_id));
      }
    }
    const revisions=db.prepare('SELECT * FROM research_memory_revisions ORDER BY old_memory_id,new_job_id').all();
    for (const revision of revisions) remember(path.join(paths.hypotheses,`revision-${revision.old_memory_id}-${revision.new_job_id}.md`),[
      '# 過去の判断の再評価', '',`記録日時: ${revision.created_at}`,`旧記憶: ${revision.old_memory_id}`,`新ジョブ: ${revision.new_job_id}`, '',
      '## 更新理由', '',String(revision.reason),'','旧記録は履歴として保持し、通常の記憶検索から除外します。根拠文書の変更と仮説の真偽は別に評価します。',
    ],String(revision.new_job_id));
    if(db.prepare("SELECT name FROM sqlite_master WHERE name='research_hypothesis_reviews'").get()) {
      for(const row of db.prepare('SELECT * FROM research_hypothesis_reviews ORDER BY memory_id,job_id').all()) {
        const review=JSON.parse(String(row.review_json));
        remember(path.join(paths.hypotheses,`evidence-review-${row.memory_id}-${row.job_id}.md`),[
          '# 仮説の観測条件と新資料の照合','',`記録: ${row.created_at}`,`旧記憶: ${row.memory_id}`,`ジョブ: ${row.job_id}`,'',
          `評価: ${review.status} / 確信度: ${review.confidence}`,String(review.reason),`原文引用ID: ${review.claimIds.join(', ')}`,'',
          '出典の記述による候補評価。独立した事実確認は未実施。以前の仮説・評価は上書きしない。',
        ],String(row.job_id));
      }
    }
    // A snapshot per completed job records interest decay/revival and concept links without overwrites.
    for (const article of articles) {
      const job=String(article.job_id);
      const analyzed=db.prepare("SELECT data_json FROM checkpoints WHERE job_id=? AND stage='analyze'").get(job);
      const quality=analyzed?(JSON.parse(String(analyzed.data_json)) as AnalysisResult).quality:null;
      // Reviews survive memory deduplication: a maintained view need not create
      // another memory event, but its evaluation is still a durable artifact.
      for(const review of quality?.viewReviews??[])remember(path.join(paths.memory,`view-review-${review.memoryId}-${job}.md`),[
        '# 見解の再評価履歴','',`以前の記憶: ${review.memoryId}`,`新ジョブ: ${job}`,`記録: ${article.created_at}`,'',
        `評価: ${review.action} / 確信度 ${review.previousConfidence} → ${review.confidence}`,'',review.reason,'',
        `反対材料の主張ID: ${review.counterClaimIds.join(', ') || '対応する原文はまだない'}`,'',
        '以前の見解を事実として再利用しない。旧記録を保持し、維持・修正・採用撤回の理由を追記する。',
      ],job);
      const selected=db.prepare("SELECT data_json FROM checkpoints WHERE job_id=? AND stage='selected-items'").get(job);
      const decision=db.prepare('SELECT decision_json FROM autonomy_decisions WHERE job_id=?').get(job);
      const queue=db.prepare('SELECT memory_json FROM research_queue WHERE job_id=?').get(job);
      const input=db.prepare('SELECT input_json FROM jobs WHERE id=?').get(job)!;
      const topic=JSON.parse(String(input.input_json)).topic;
      const count=db.prepare("SELECT count(*) AS n FROM research_memory_events WHERE kind='interpretation' AND topic=? AND created_at<=?").get(topic,String(article.created_at));
      // Counts are fixed at export using job order (memory timestamps follow article generation).
      const references=selected ? JSON.parse(String(selected.data_json)).items as Array<{id:string;versionId:string;title:string;sourceId:string}> : [];
      const previous=queue ? JSON.parse(String(queue.memory_json)) as Array<{createdAt:string}> : [];
      const gap=previous.length ? Math.max(0,Date.parse(String(article.created_at))-Math.max(...previous.map(m=>Date.parse(m.createdAt))))/86400000 : null;
      remember(path.join(paths.memory,`interest-${job}.md`),[
        `# 関心と概念の記録: ${line(topic)}`, '',`記録日時: ${article.created_at}`,`ジョブ: ${job}`,'',
        `- 過去の観測回数: ${count?.n ?? 0} / 今回の観測を追加`,
        `- 前の関連記憶からの日数: ${gap===null ? '初回' : gap.toFixed(2)}`,
        `- 関心の重み: (過去の観測回数 + 1) × exp(-経過日数 / 30)。新しい観測で再び強まる。`,
        ...(decision ? [`- テーマ選択: ${line(decision.decision_json)}`] : []),'',
        '## 組織・概念間の関係（共出現。因果関係は未確認）','',
        ...references.slice(0,12).map(r=>`- ${line(r.sourceId)} → 記述 → ${line(r.title)} / [文書版](../Articles/${r.id}-${r.versionId}.md)`),
      ],job);
    }
  } finally {db.close();}
  const result={matching:0,repaired:0,conflicts:[] as string[]};
  for (const artifact of history.artifacts()) {
    own(artifact.path);
    if (contentDigest(artifact.contents)!==artifact.digest) throw new Error('KNOWLEDGE_DIGEST_MISMATCH');
    let missing=false;
    try {
      const info=await lstat(artifact.path);
      if (!info.isFile() || info.isSymbolicLink() || contentDigest(await readFile(artifact.path,'utf8'))!==artifact.digest) {
        result.conflicts.push(artifact.path);history.repair(artifact.path,'conflict');continue;
      }
      result.matching++;continue;
    } catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;missing=true;}
    if (missing) {
      try {await publishArtifact(artifact.path,artifact.contents,()=>own(artifact.path));result.repaired++;history.repair(artifact.path,'restored');}
      catch(e) {if (!String(e).includes('ARTIFACT_CONFLICT')) throw e;result.conflicts.push(artifact.path);history.repair(artifact.path,'conflict');}
    }
  }
  return result;
}

export async function ensureDataDirectories(config: AutonomousConfig) {
  const paths=autonomousPaths(config);
  for (const dir of Object.values(paths).filter(p=>p!==paths.database)) await mkdir(dir,{recursive:true});
  return paths;
}

export async function checkCapacity(config: AutonomousConfig, artifactCount: number) {
  const paths=autonomousPaths(config);
  const stats=await statfs(paths.root);
  if (stats.bavail*stats.bsize < config.minFreeMiB*1024*1024) throw new Error('CAPACITY_LOW_DISK: collection paused; no data removed');
  let size=0;
  for (const file of [paths.database,paths.database+'-wal']) {
    try {size+=(await lstat(file)).size;} catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  }
  if (size>=config.maxDatabaseMiB*1024*1024 || artifactCount>=config.maxKnowledgeFiles) throw new Error('CAPACITY_LIMIT: collection paused; archive and increase limits explicitly');
}
