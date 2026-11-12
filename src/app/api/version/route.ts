// The version that is live right now. The app checks this to offer "a new version is ready".
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(JSON.stringify({ build: process.env.VERCEL_GIT_COMMIT_SHA || "dev" }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
