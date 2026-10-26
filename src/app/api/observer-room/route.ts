import { createResearchHttp } from "@/lib/kousatsu/runtime-http";
import { createObserverReaders } from "@/lib/observer-room-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the existing loopback / same-origin checks. This endpoint exports no POST.
export async function GET(request: Request) {
  // Defer config IO until after the access check, and avoid unhandled rejections.
  const readers = () => createObserverReaders();
  return createResearchHttp({
    snapshot: () => readers().snapshot(),
    note: (id) => readers().note(id),
  }).GET(request);
}
