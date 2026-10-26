"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResearchSnapshot } from "@/lib/kousatsu/runtime-types";

export function useResearchRuntime() {
  const [snapshot,setSnapshot]=useState<ResearchSnapshot|null>(null);
  const [connectionError,setConnectionError]=useState<string|null>(null);
  const [actionError,setActionError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const sequence=useRef(0);
  const alive=useRef(false);
  const actionLocked=useRef(false);

  const refresh=useCallback(async (signal?: AbortSignal) => {
    const request=++sequence.current;
    try {
      const response=await fetch('/api/kousatsu',{cache:'no-store',signal});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || 'ローカル機能に接続できません。');
      if (alive.current && request===sequence.current) { setSnapshot(data); setConnectionError(null); }
    } catch (failure) {
      if (alive.current && request===sequence.current && !signal?.aborted) {
        setConnectionError(failure instanceof Error ? failure.message : '接続に失敗しました。');
      }
    }
  },[]);

  useEffect(()=>{
    alive.current=true;
    const controller=new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll=async()=>{
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer=setTimeout(poll,4_000);
    };
    void poll();
    return ()=>{alive.current=false;controller.abort();clearTimeout(timer);};
  },[refresh]);

  const post=useCallback(async (action: Record<string,unknown>)=>{
      const response=await fetch('/api/kousatsu',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action),
      });
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || '処理に失敗しました。');
      await refresh();
      if (data.status==='blocked' || data.status==='retry_wait') {
        throw new Error(data.error || '処理が停止しました。履歴の診断を確認してください。');
      }
      return data;
  },[refresh]);

  const exclusive=useCallback(async <T,>(operation:()=>Promise<T>):Promise<T>=>{
    // React state updates are asynchronous. A ref closes the pre-render double-click window.
    if (actionLocked.current) throw new Error('処理の送信中です。完了までお待ちください。');
    actionLocked.current=true;
    setBusy(true);
    setActionError(null);
    try {
      return await operation();
    } catch (failure) {
      if (alive.current) setActionError(failure instanceof Error ? failure.message : '処理に失敗しました。');
      throw failure;
    } finally {
      actionLocked.current=false;
      if (alive.current) setBusy(false);
    }
  },[]);

  const act=useCallback((action:Record<string,unknown>)=>exclusive(()=>post(action)),[exclusive,post]);

  const run=useCallback(async (sourceId: string,topic: string)=>{
    return exclusive(async()=>{
      await post({action:'enqueue',sourceId,topic:topic.trim() || undefined});
      return post({action:'tick'});
    });
  },[exclusive,post]);

  return {snapshot,error:actionError ?? connectionError,busy,refresh,act,run};
}

export type ResearchController=ReturnType<typeof useResearchRuntime>;
