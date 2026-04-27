-- Conversation: denormalised actor of last status change + back-link to email
ALTER TABLE "Conversation"
  ADD COLUMN "lastStatusChangedById" TEXT,
  ADD COLUMN "lastStatusChangedAt"   TIMESTAMP(3),
  ADD COLUMN "incomingEmailId"       TEXT;

-- Unique: one conversation per IncomingEmail (when set)
CREATE UNIQUE INDEX "Conversation_incomingEmailId_key" ON "Conversation"("incomingEmailId");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_lastStatusChangedById_fkey"
    FOREIGN KEY ("lastStatusChangedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversation_incomingEmailId_fkey"
    FOREIGN KEY ("incomingEmailId") REFERENCES "IncomingEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Message: free-form structured metadata (used to hide LANDING_SENT bubbles
-- in favour of the rich event card)
ALTER TABLE "Message"
  ADD COLUMN "metadata" JSONB;

-- Conversation timeline events (status changes, landing-sent, assignments…)
CREATE TYPE "ConversationEventType" AS ENUM ('STATUS_CHANGED', 'LANDING_SENT', 'ASSIGNED');

CREATE TABLE "ConversationEvent" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "type"           "ConversationEventType" NOT NULL,
  "actorUserId"    TEXT,
  "payload"        JSONB NOT NULL,
  "companyId"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationEvent_conversationId_createdAt_idx"
  ON "ConversationEvent"("conversationId", "createdAt");
CREATE INDEX "ConversationEvent_companyId_idx"
  ON "ConversationEvent"("companyId");
CREATE INDEX "ConversationEvent_type_idx"
  ON "ConversationEvent"("type");

ALTER TABLE "ConversationEvent"
  ADD CONSTRAINT "ConversationEvent_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ConversationEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ConversationEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
