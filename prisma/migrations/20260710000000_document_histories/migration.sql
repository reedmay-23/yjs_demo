-- CreateTable
CREATE TABLE "document_histories" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "summary" VARCHAR(500),
    "content" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_version" INTEGER,

    CONSTRAINT "document_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_histories_document_id_idx" ON "document_histories"("document_id");

-- CreateIndex
CREATE INDEX "document_histories_user_id_idx" ON "document_histories"("user_id");

-- CreateIndex
CREATE INDEX "document_histories_created_at_idx" ON "document_histories"("created_at");

-- AddForeignKey
ALTER TABLE "document_histories" ADD CONSTRAINT "document_histories_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_histories" ADD CONSTRAINT "document_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
