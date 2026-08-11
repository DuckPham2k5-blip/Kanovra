import { getCurrentUser, getProjectContext } from "@/lib/auth";
import { BANNER_MIME_TYPES } from "@/lib/project-banners";
import { readAttachment } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serves a project's uploaded backdrop.
 *
 * Keyed on the project rather than the file id, so the permission question is
 * the same one the page already answers — may this person see this project? —
 * and there is no separate id to leak or guess. Membership is re-checked here
 * and not inherited from whoever rendered the page: a URL outlives the render
 * that produced it, and people leave workspaces.
 *
 * The stored type is checked against the allowlist before it is sent, not
 * trusted because it is in the database. `nosniff` then stops the browser
 * second-guessing it, so a file renamed to look like a picture cannot become
 * script on our origin.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Same answer for "no such project" and "not yours" — this never confirms an
  // id exists to someone who cannot see it.
  const ctx = await getProjectContext(user.id, projectId);
  if (!ctx?.project.bannerImageId) return new Response("Not found", { status: 404 });

  const mime = ctx.project.bannerImageMime;
  if (!mime || !BANNER_MIME_TYPES.has(mime)) return new Response("Not found", { status: 404 });

  const file = await readAttachment(ctx.project.bannerImageId);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(file.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      // Private: a shared cache must never hand one workspace's picture to
      // somebody outside it, and revalidating each time keeps a replaced
      // backdrop from lingering in the browser.
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
