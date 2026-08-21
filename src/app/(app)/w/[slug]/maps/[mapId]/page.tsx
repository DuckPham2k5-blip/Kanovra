import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MindMapCanvas } from "@/components/mind-map/mind-map-canvas";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth";
import { parseCanvas } from "@/lib/mind-map-canvas";
import { defaultPalette, MIND_MAP_META, mindMapBackdrop, mindMapColor } from "@/lib/mind-maps";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage({
  params,
}: {
  params: Promise<{ slug: string; mapId: string }>;
}) {
  const { slug, mapId } = await params;
  const { workspace, can, user } = await requireWorkspace(slug);

  // Scoped by workspace, not just by id: an id from another workspace must
  // read as missing rather than as forbidden.
  const map = await prisma.mindMap.findFirst({
    where: { id: mapId, workspaceId: workspace.id },
    select: { id: true, title: true, type: true, data: true },
  });
  if (!map) notFound();

  const meta = MIND_MAP_META[map.type];
  // The map's own colour, falling back to the one its type is born with.
  const palette = defaultPalette(map.type);
  const canvas = parseCanvas(map.data);

  const [comments, members, reads] = await Promise.all([
    prisma.mindMapComment.findMany({
      where: { mapId: map.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nodeId: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, imageUrl: true } },
      },
    }),
    // Only for drawing avatars on nodes: presence answers with ids, and an id is
    // not a face. Fetched here rather than added to the presence payload, which
    // is polled every ten seconds and would carry the same names each time.
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      select: { user: { select: { id: true, name: true, imageUrl: true } } },
    }),
    // Only this reader's rows. Everyone else's "read" is their business, and
    // fetching the table would grow with the team for no one's benefit.
    prisma.mindMapCommentRead.findMany({
      where: { mapId: map.id, userId: user.id },
      select: { nodeId: true, readAt: true },
    }),
  ]);

  return (
    /*
     * Covers the shell rather than replacing it. A map is a whole-screen
     * document — the sidebar and the top bar are navigation for a workspace,
     * and they crowd a canvas that wants every pixel.
     *
     * A fixed overlay rather than a route outside the app group: the shell
     * keeps running underneath, which is what carries presence, the realtime
     * stream and the ⌘K palette. Escaping the layout would have meant
     * rebuilding all three for one page.
     */
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{
        background: `${mindMapBackdrop(palette)}, hsl(var(--background))`,
      }}
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: mindMapColor(palette, 0.24) }}
      >
        <Button asChild variant="outline" size="sm" className="tf-bar-control">
          <Link href={`/w/${slug}/maps`}>
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{map.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {meta.label} · {meta.question}
          </p>
        </div>
      </header>

      <MindMapCanvas
        mapId={map.id}
        type={map.type}
        palette={palette}
        title={map.title}
        initialNodes={canvas.nodes}
        initialRadial={canvas.radial}
        canEdit={can("project:update")}
        canComment={can("comment:create")}
        // `mine` is decided here rather than compared in the browser: whether
        // the delete control appears is a permission question, and a permission
        // question answered by the client is a suggestion.
        comments={comments.map((comment) => ({
          ...comment,
          mine: comment.author.id === user.id,
        }))}
        members={members.map((member) => member.user)}
        // Serialised, because this crosses into a client component and a `Date`
        // that arrives there is one more value that has to render identically on
        // the server and at hydration.
        reads={Object.fromEntries(reads.map((row) => [row.nodeId, row.readAt.toISOString()]))}
      />
    </div>
  );
}
