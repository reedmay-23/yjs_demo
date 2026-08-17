-- CreateTable
CREATE TABLE "document_updates" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "update" JSONB NOT NULL,
    "byte_length" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_updates_document_id_idx" ON "document_updates"("document_id");

-- CreateIndex
CREATE INDEX "document_updates_user_id_idx" ON "document_updates"("user_id");

-- CreateIndex
CREATE INDEX "document_updates_created_at_idx" ON "document_updates"("created_at");

-- AddForeignKey
ALTER TABLE "document_updates" ADD CONSTRAINT "document_updates_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_updates" ADD CONSTRAINT "document_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
