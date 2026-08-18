-- Give document text comments an explicit backend representation while
-- preserving existing room chat messages.
ALTER TABLE "chat_messages"
ADD COLUMN "context_type" VARCHAR(32) NOT NULL DEFAULT 'chat',
ADD COLUMN "quoted_text" TEXT;

CREATE INDEX "chat_messages_room_id_context_type_idx"
ON "chat_messages"("room_id", "context_type");
