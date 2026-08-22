import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MindMapSurface } from "@/components/mind-map/mind-map-surface";
import { requireWorkspace } from "@/lib/auth";
import { parseCanvas } from "@/lib/mind-map-canvas";
import { mapVersion } from "@/lib/mind-map-version";
import { MIND_MAP_META } from "@/lib/mind-maps";
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
    select: {
      id: true,
      title: true,
      type: true,
      data: true,
      hue: true,
      tone: true,
      backgroundKind: true,
      backgroundValue: true,
    },
  });
  if (!map) notFound();

  const meta = MIND_MAP_META[map.type];
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
    <MindMapSurface
      slug={slug}
      mapId={map.id}
      type={map.type}
      title={map.title}
      typeLabel={meta.label}
      typeQuestion={meta.question}
      // Handed over as the columns rather than as a palette: the picker has to
      // be able to go back to "no colour of its own", and every palette is some
      // colour.
      storedHue={map.hue}
      storedTone={map.tone}
      storedBackgroundKind={map.backgroundKind}
      storedBackgroundValue={map.backgroundValue}
      canEdit={can("project:update")}
      canComment={can("comment:create")}
      initialNodes={canvas.nodes}
      initialRadial={canvas.radial}
      initialRecents={canvas.recents}
      // The row held something and none of it could be read. Handed down so the
      // canvas can decline to autosave over it — see `parseCanvas`.
      unreadable={canvas.unreadable}
      // Of the document as *stored*, not as parsed: a save has to be compared
      // against what is in the row, including the parts this build dropped.
      initialVersion={mapVersion(map.data)}
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
  );
}
