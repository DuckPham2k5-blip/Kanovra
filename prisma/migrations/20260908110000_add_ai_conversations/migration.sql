-- The assistant's conversations.
--
-- Purely additive: a new enum and two new tables, no column touched on any
-- existing one. No data-loss warning, and it applies to an empty VPS database
-- exactly as it applies here.

CREATE TYPE "AiRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "imageId" TEXT,
    "imageMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- The only listing there is: mine, in this workspace, most recent first.
CREATE INDEX "ai_conversations_userId_workspaceId_updatedAt_idx"
    ON "ai_conversations"("userId", "workspaceId", "updatedAt");

-- Every read of a conversation is its turns in the order they were written.
CREATE INDEX "ai_messages_conversationId_createdAt_idx"
    ON "ai_messages"("conversationId", "createdAt");

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a person takes their conversations with them. They are private to
-- that person, so there is nobody left for them to belong to.
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
