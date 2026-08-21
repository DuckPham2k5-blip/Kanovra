import type { Metadata } from "next";

import { MindMapGallery } from "@/components/mind-map/mind-map-gallery";
import { MindMapList } from "@/components/mind-map/mind-map-list";
import { PageHeader } from "@/components/shared/page-header";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Maps" };

export default async function MapsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);

  const maps = await prisma.mindMap.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, type: true, updatedAt: true, hue: true, tone: true },
  });

  /*
   * Listed below the types, not hidden behind them.
   *
   * These used to be grouped onto a `…` on each type card, on the reasoning that
   * you arrive here wanting a *kind* of map and your earlier ones matter only
   * after you have chosen the kind. That holds for the visit where you are making
   * something and fails completely for the visit where you are going back to a
   * map you already drew — and nothing on the page told the two apart. Six cards
   * that all mean "make a new one", with fifty-nine existing maps and no sign on
   * screen that any of them were there, read as a section where clicking anything
   * refuses to open a map.
   *
   * `updatedAt` is serialised here rather than passed as a Date: it crosses into
   * a client component, where a Date survives the boundary but arrives as one
   * more thing that has to match between the server render and hydration.
   */
  const entries = maps.map((map) => ({ ...map, updatedAt: map.updatedAt.toISOString() }));

  return (
    <div>
      <PageHeader
        title="Maps"
        description="Six ways of laying out a thought. Pick the one that matches the question you are asking."
      />

      <div className="p-4 sm:p-6">
        <MindMapGallery workspaceSlug={slug} workspaceId={workspace.id} />
        <MindMapList workspaceSlug={slug} maps={entries} />
      </div>
    </div>
  );
}
