"use client";

import { useEffect, useState } from 'react';

import type { ResearchNote } from '@/lib/kousatsu/runtime-types';
import { researchActivity, researchStageLabels } from '@/lib/kousatsu/runtime-status';
import type { ResearchController } from './useResearchRuntime';

const jobLabels: Record<string,string>={pending:'実行待ち',running:'処理中',succeeded:'保存完了',needs_review:'要確認',retry_wait:'再試行待ち',failed:'失敗',cancelled:'中止'};

export function ResearchConsole({research,notesOnly=false}:{research:ResearchController;notesOnly?:boolean}) {
  const {snapshot,error,busy,act,run}=research;
  const [sourceId,setSourceId]=useState('');
  const [topic,setTopic]=useState('');
  const [noteId,setNoteId]=useState('');
  const [note,setNote]=useState<ResearchNote|null>(null);
  const [noteError,setNoteError]=useState<string|null>(null);
  const enabled=snapshot?.sources.filter((source)=>source.enabled) ?? [];
  const activeSource=enabled.find((source)=>source.id===sourceId) ?? enabled[0];
  const activeNoteId=noteId || snapshot?.notes[0]?.id;
  const activity=researchActivity(snapshot);

  useEffect(()=>{
    if (!activeNoteId) return;
    const controller=new AbortController();
    void (async()=>{
      try {
        const response=await fetch(`/api/kousatsu?note=${encodeURIComponent(activeNoteId)}`,{cache:'no-store',signal:controller.signal});
        const data=await response.json();
        if (!response.ok) throw new Error(data.error || 'ノートを開けませんでした。');
        if (!controller.signal.aborted) {setNote(data);setNoteError(null);}
      } catch (failure) {
        if (!controller.signal.aborted) setNoteError(failure instanceof Error ? failure.message : '読込失敗');
      }
    })();
    return ()=>controller.abort();
  },[activeNoteId,snapshot]);

  // Errors are shown by the controller; event handlers must not produce unhandled promises.
  const perform=(operation:Promise<unknown>)=>{void operation.catch(()=>{});};

  return <section className="research-console" aria-label="ローカル調査とノート">
    <div className="terminal-readout">
      <p>ローカル調査</p>
      <strong role="status">{snapshot ? activity.label : error ? '接続できません' : '接続を確認中'}</strong>
      <span>構造・出典の検査と、独立した事実確認は別です。仮説・解釈は未検証のまま記録します。</span>
      {error ? <span role="alert">{error}</span> : null}
    </div>
    {!notesOnly && snapshot ? <>
      {!snapshot.initialized ? <button disabled={busy} type="button" onClick={()=>perform(act({action:'initialize'}))}>ローカル機能を準備</button> : null}
      {enabled.length ? <form onSubmit={(event)=>{event.preventDefault();if(activeSource) perform(run(activeSource.id,topic));}}>
        <label>出典<select value={activeSource?.id ?? ''} onChange={(event)=>setSourceId(event.target.value)}>
          {enabled.map((source)=><option key={source.id} value={source.id}>{source.name}</option>)}
        </select></label>
        <label>調査テーマ<input maxLength={200} placeholder={activeSource?.topic} value={topic} onChange={(event)=>setTopic(event.target.value)}/></label>
        <button disabled={busy || !activeSource} type="submit">収集してノートを作る</button>
      </form> : <p>収集する出典は未設定です。利用条件を確認したRSS/Atomをローカル設定に追加してください。</p>}
      <button disabled={busy || !snapshot.initialized} type="button" onClick={()=>perform(act({action:'tick'}))}>待機ジョブを実行</button>
      <details><summary>処理履歴（{snapshot.jobs.length}）</summary><ol>
        {snapshot.jobs.map((job)=><li key={job.id}>
          <strong>{job.topic} — {jobLabels[job.status] ?? job.status}</strong>
          <span>{researchStageLabels[job.stage ?? ''] ?? ''}{job.queue==='blocked' ? ' / 安全停止' : ''}</span>
          {job.error ? <span role="alert">{job.error}</span> : null}
          {job.queue && job.status!=='running' && job.status!=='failed' ? <button disabled={busy} type="button"
            onClick={()=>perform(act({action:'retry',jobId:job.id}).then(()=>act({action:'tick'})))}>
            {job.status==='succeeded' || job.status==='needs_review' ? '保存ファイルを検査・復旧' : '同じ入力で再試行'}
          </button> : null}
          {job.queue && job.queue!=='done' && job.status!=='running' ? <button disabled={busy} type="button"
            onClick={()=>perform(act({action:'cancel',jobId:job.id}))}>履歴を保持して実行を中止</button> : null}
        </li>)}
      </ol></details>
    </> : null}
    <div className="terminal-readout research-notes">
      <p>Markdownノート</p>
      {snapshot?.notes.length ? <>
        <label>保存済みノート<select value={activeNoteId} onChange={(event)=>setNoteId(event.target.value)}>
          {snapshot.notes.map((entry)=><option key={entry.id} value={entry.id}>{entry.title} / {entry.createdAt.slice(0,16)}</option>)}
        </select></label>
        {noteError ? <span role="alert">{noteError}</span> : null}
        {note && note.id===activeNoteId ? <>
          <span>事実確認: {note.verification?.factCheckStatus==='contradicted' ? '矛盾あり' : '未実施'} / 構造検査: {note.verification?.status==='passed' ? '通過' : '要確認'}</span>
          <span>保存ファイル: {{matching:'DBと一致',missing:'欠落（DBに正本あり）',conflict:'不一致（上書き停止）',unpublished:'未出力'}[note.artifact]}</span>
          <a href={`/api/kousatsu?note=${encodeURIComponent(note.id)}&download=1`} download>Markdownをダウンロード</a>
          <pre tabIndex={0}>{note.markdown}</pre>
        </> : <span>ノートを読み込み中…</span>}
      </> : <span>まだノートはありません。</span>}
    </div>
    {!notesOnly && snapshot ? <>
      <details><summary>関心の履歴</summary><ol>{snapshot.interests.map((interest)=><li key={interest.topic}>
        <strong>{interest.topic}</strong><span>{interest.observations}回の記録 / 最終 {interest.lastSeenAt.slice(0,10)}</span>
      </li>)}</ol></details>
      <details><summary>解釈・仮説の時間軸（未検証）</summary><ol>{snapshot.memories.map((memory)=><li key={memory.id}>
        <time dateTime={memory.createdAt}>{memory.createdAt.slice(0,16)}</time>
        <strong>{memory.kind==='hypothesis' ? '仮説' : '解釈'}: {memory.topic}</strong>
        <span>{memory.text}</span><span>{memory.reason}</span>
        <small>参照 {memory.references.length}文書版 / 構造検査 {memory.verificationStatus==='passed' ? '通過' : '失敗'}</small>
      </li>)}</ol></details>
    </> : null}
  </section>;
}
