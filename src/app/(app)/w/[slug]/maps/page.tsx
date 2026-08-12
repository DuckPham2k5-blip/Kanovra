import type { MindMapType } from "@prisma/client";
import type { Metadata } from "next";

import { MindMapGallery } from "@/components/mind-map/mind-map-gallery";
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
    select: { id: true, title: true, type: true },
  });

  /*
   * Grouped by type rather than listed above the picker.
   *
   * A flat list of everything ever made pushes the eight types down the page
   * and answers a question nobody asked — you arrive here wanting a *kind* of
   * map, and your earlier ones matter only once you have decided which kind.
   * Behind the `…` on each card they are exactly one click away from the
   * moment they become relevant.
   */
  const existing: Partial<Record<MindMapType, { id: string; title: string }[]>> = {};
  for (const map of maps) {
    (existing[map.type] ??= []).push({ id: map.id, title: map.title });
  }

  return (
    <div>
      <PageHeader
        title="Maps"
        description="Eight ways of laying out a thought. Pick the one that matches the question you are asking."
      />

      <div className="p-4 sm:p-6">
        <MindMapGallery workspaceSlug={slug} workspaceId={workspace.id} existing={existing} />
      </div>
    </div>
  );
}
