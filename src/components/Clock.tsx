"use client";

import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Tokyo",
});

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const initialTick = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 1000);

    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <time
      className="font-mono text-3xl font-medium tabular-nums text-slate-100 sm:text-4xl"
      dateTime={now?.toISOString()}
      aria-label="現在時刻"
    >
      {now ? formatter.format(now) : "--:--:--"}
    </time>
  );
}
