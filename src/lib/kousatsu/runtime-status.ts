import type { ResearchSnapshot } from './runtime-types';

export const researchStageLabels: Record<string,string> = {
  collect:'情報を収集中',classify:'出典の主張を整理中',relate:'過去の記録と照合中',
  analyze:'解釈と仮説を作成中',draft:'ノートを作成中',verify:'構造と出典を検査中',export:'ノートを保存中',
};

/** Displayed activity is derived from persisted jobs, never a timer-generated simulation. */
export function researchActivity(snapshot: ResearchSnapshot|null) {
  const running=snapshot?.jobs.find((job)=>job.status==='running');
  if (running) return {kind:'running' as const,label:researchStageLabels[running.stage ?? ''] ?? '処理中',
    thought:`「${running.topic}」を処理しています。${researchStageLabels[running.stage ?? ''] ?? '記録を確認中'}。`,jobId:running.id};
  const blocked=snapshot?.jobs.find((job)=>job.queue==='blocked');
  if (blocked) return {kind:'blocked' as const,label:'確認が必要',thought:`「${blocked.topic}」の処理を安全のため停止しました。端末で診断を確認できます。`,jobId:blocked.id};
  const queued=snapshot?.jobs.find((job)=>job.queue==='ready');
  if (queued) return {kind:'queued' as const,label:'実行待ち',thought:`「${queued.topic}」は実行待ちです。まだ処理は完了していません。`,jobId:queued.id};
  return {kind:'idle' as const,label:'待機中',thought:'現在、実行中の調査はありません。',jobId:null};
}
