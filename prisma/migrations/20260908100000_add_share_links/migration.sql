-- Public read-only share links.
--
-- Purely additive: one new table, no column on any existing one, so there is no
-- data-loss warning to acknowledge and this applies to an empty VPS database
-- exactly as it applies here.
--
-- `projectId` is UNIQUE rather than indexed: one link per project is the
-- product decision, and the database is where it is actually enforced. A second
-- link created by a race would otherwise leave two secrets for one board with
-- only one of them visible in the interface — a link nobody can see is a link
-- nobody can revoke.

CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "share_links_projectId_key" ON "share_links"("projectId");

-- Every public request looks the link up by this and nothing else, so it is the
-- one index that has to exist for the page to be cheap.
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

ALTER TABLE "share_links" ADD CONSTRAINT "share_links_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting the person who published a board takes the link with them. That is
-- the safe direction: the alternative is a live public link whose author no
-- longer has an account, which nobody would think to go looking for.
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
