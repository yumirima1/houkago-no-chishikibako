"use client";

import { useEffect, useState } from "react";

export function DesktopClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      setNow(new Date());
      timer = setTimeout(sync, 60_000 - Date.now() % 60_000 + 20);
    };
    timer = setTimeout(sync, 0);
    document.addEventListener("visibilitychange", sync);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", sync); };
  }, []);
  const text = now ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "--:--";
  return <time aria-label="PCの現在時刻" dateTime={now?.toISOString()} title={now?.toLocaleString()}>{text}</time>;
}
