import type { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { prisma } from "@/lib/prisma";

/**
 * Keeps the local `users` table in sync with Clerk.
 *
 * Configure in the Clerk dashboard → Webhooks:
 *   URL:    https://<your-domain>/api/webhooks/clerk
 *   Events: user.created, user.updated, user.deleted
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  let event: WebhookEvent;
  try {
    event = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (error) {
    console.error("[clerk-webhook] signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const { id, email_addresses, primary_email_address_id, first_name, last_name, username, image_url } =
          event.data;

        const primary =
          email_addresses.find((e) => e.id === primary_email_address_id) ?? email_addresses[0];
        if (!primary) break;

        const name =
          [first_name, last_name].filter(Boolean).join(" ") ||
          username ||
          primary.email_address.split("@")[0];

        // Match on clerkId first; fall back to email so a seeded or invited
        // placeholder row is adopted instead of colliding on the unique index.
        const existing = await prisma.user.findFirst({
          where: { OR: [{ clerkId: id }, { email: primary.email_address }] },
        });

        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { clerkId: id, email: primary.email_address, name, imageUrl: image_url },
          });
        } else {
          await prisma.user.create({
            data: { clerkId: id, email: primary.email_address, name, imageUrl: image_url },
          });
        }
        break;
      }

      case "user.deleted": {
        if (event.data.id) {
          await prisma.user.deleteMany({ where: { clerkId: event.data.id } });
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`[clerk-webhook] failed to handle ${event.type}`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
