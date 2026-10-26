import { createResearchHttp } from "@/lib/kousatsu/runtime-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createResearchHttp();

export const GET = handlers.GET;
export const POST = handlers.POST;
