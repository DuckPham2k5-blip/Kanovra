"use server";

import { MindMapType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/events";
import { canvasSchema } from "@/lib/mind-map-canvas";
import { TONE_NAMES } from "@/lib/mind-map-palette";
import { MIND_MAP_META } from "@/lib/mind-maps";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fail, NOT_FOUND, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

/**
 * Mind maps are workspace content, so they reuse the project permissions
 * rather than inventing an axis of their own: anyone who may create a project
 * may create a map, and a viewer may read but not write. Adding a parallel set
 * would mean two matrices to keep in step and one of them going stale.
 */

const createSchema = z.object({
  workspaceId: z.string().min(1),
  type: z.nativeEnum(MindMapType),
  title: z.string().trim().min(1, "Give the map a title").max(120),
  projectId: z.string().min(1).nullish(),
});

/**
 * A colour, validated as a hue and a tone rather than accepted as a string.
 *
 * `nullable` on both, and that is the reset: a map with neither draws in the hue
 * its type is born with. The tone is checked against the list rather than stored
 * as whatever arrives, because it reaches CSS — an unchecked string here is a
 * value the browser will happily interpolate into a colour function.
 */
const paletteSchema = z.object({
  mapId: z.string().min(1),
  hue: z.number().int().min(0).max(359).nullable(),
  tone: z.enum(TONE_NAMES).nullable(),
});

export async function createMindMap(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(createSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!can(membership?.role, "project:create")) throw new ForbiddenError();

    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      select: { slug: true },
    });
    if (!workspace) return fail(NOT_FOUND);

    const map = await prisma.mindMap.create({
      data: {
        workspaceId: data.workspaceId,
        projectId: data.projectId ?? null,
        type: data.type,
        title: data.title,
        // Empty rather than pre-filled with examples: a map that arrives with
        // somebody else's content is one more thing to delete before starting.
        data: {},
        createdById: user.id,
      },
    });

    await logActivity({
      workspaceId: data.workspaceId,
      actorId: user.id,
      type: "PROJECT_UPDATED",
      message: `${user.name} started a ${MIND_MAP_META[data.type].label.toLowerCase()}: ${map.title}`,
    });

    revalidatePath(`/w/${workspace.slug}/maps`);
    return ok({ id: map.id });
  });
}

export async function deleteMindMap(mapId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();

    const map = await prisma.mindMap.findUnique({
      where: { id: mapId },
      select: { workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    // Membership first, permission second — the same answer for "no such map"
    // and "not your workspace" keeps an id from confirming it exists.
    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:delete")) throw new ForbiddenError();

    await prisma.mindMap.delete({ where: { id: mapId } });

    revalidatePath(`/w/${map.workspace.slug}/maps`);
    return ok(undefined);
  });
}

const renameSchema = z.object({
  mapId: z.string().min(1),
  title: z.string().trim().min(1, "Give the map a title").max(120),
});

export async function renameMindMap(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(renameSchema, input);

    const map = await prisma.mindMap.findUnique({
      where: { id: data.mapId },
      select: { workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:update")) throw new ForbiddenError();

    await prisma.mindMap.update({ where: { id: data.mapId }, data: { title: data.title } });

    revalidatePath(`/w/${map.workspace.slug}/maps`);
    return ok(undefined);
  });
}

/**
 * Replaces a map's contents.
 *
 * The payload is validated against the schema for *this map's* type, read from
 * the row rather than taken from the request — otherwise a caller could send a
 * bridge map's shape to a tree map and store something no renderer can read.
 */
export async function updateMindMapData(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const { mapId, data } = parse(
      z.object({ mapId: z.string().min(1), data: z.unknown() }),
      input,
    );

    const map = await prisma.mindMap.findUnique({
      where: { id: mapId },
      select: { type: true, workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:update")) throw new ForbiddenError();

    const parsed = canvasSchema.safeParse(data ?? {});
    if (!parsed.success) return fail("Some of that could not be saved. Check the lengths.");

    await prisma.mindMap.update({
      where: { id: mapId },
      data: { data: parsed.data },
    });

    /*
     * Comments on a node that is gone are kept, not deleted.
     *
     * They used to be swept here, on the reasoning that a save is a deliberate
     * act: remove a box, decide you meant it, press Save, and the conversation
     * about that box goes with it. Autosave removes the deliberate act. The same
     * sweep now runs a second or so after a box disappears, which turns a
     * mis-click into a silently destroyed thread — and nobody is looking at a
     * comment panel at the moment they delete the node it belongs to, so nobody
     * sees it happen.
     *
     * So an orphan is hidden rather than destroyed: `nodeId` points at nothing in
     * the document, the canvas has no node to draw its badge on, and the row sits
     * in the table where it can be recovered. Nothing reads it, so nothing shows
     * it — and if the box comes back by undo or by a reload of an older save, its
     * discussion is still there.
     *
     * The old note here also worried that a reused node id would resurrect a
     * stale conversation under a new node, and keeping orphans does leave that
     * open. It is not imaginary: `newNodeId` is a base-36 timestamp plus a
     * counter that restarts with the page, so two people creating a node in the
     * same millisecond on freshly loaded tabs can collide. It needs that
     * coincidence *and* one of the two ids to belong to a deleted node that had
     * comments. Against that, the failure being traded away — a mis-click
     * quietly destroying a thread, on a timer, with nobody watching — is both
     * likelier and worse, because it cannot be undone and this can.
     */

    revalidatePath(`/w/${map.workspace.slug}/maps/${mapId}`);
    return ok(undefined);
  });
}

/**
 * Sets a map's colour.
 *
 * Its own action rather than a field on `updateMindMapData`, because the two are
 * saved on different terms: the drawing autosaves a second after every keystroke
 * and drag, and a colour is chosen once and deliberately. Folding it into the
 * document would also put it inside `MindMap.data`, where the last browser to
 * autosave overwrites what anybody else picked.
 *
 * Both columns are written together, including the nulls: "put it back to the
 * colour of its type" has to be expressible, and it is the only thing a reset
 * button can send.
 */
export async function setMindMapPalette(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(paletteSchema, input);

    const map = await prisma.mindMap.findUnique({
      where: { id: data.mapId },
      select: { workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!map) return fail(NOT_FOUND);

    const membership = await getMembership(user.id, map.workspaceId);
    if (!membership) return fail(NOT_FOUND);
    if (!can(membership.role, "project:update")) throw new ForbiddenError();

    await prisma.mindMap.update({
      where: { id: data.mapId },
      data: { hue: data.hue, tone: data.tone },
    });

    // Both the map itself and the list it appears in: a recoloured map wears its
    // colour on its card too, and that page is cached separately.
    revalidatePath(`/w/${map.workspace.slug}/maps/${data.mapId}`);
    revalidatePath(`/w/${map.workspace.slug}/maps`);
    return ok(undefined);
  });
}
