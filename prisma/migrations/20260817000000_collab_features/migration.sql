-- CreateTable
CREATE TABLE "whiteboards" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'Untitled Whiteboard',
    "description" VARCHAR(1000),
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whiteboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whiteboard_elements" (
    "id" SERIAL NOT NULL,
    "whiteboard_id" INTEGER NOT NULL,
    "element_type" VARCHAR(32) NOT NULL,
    "properties" JSONB NOT NULL,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whiteboard_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL DEFAULT 'Document Chat',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" VARCHAR(32) NOT NULL DEFAULT 'text',
    "parent_id" INTEGER,
    "mentions" JSONB,
    "reactions" JSONB,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_boards" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'Task Board',
    "description" VARCHAR(1000),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_columns" (
    "id" SERIAL NOT NULL,
    "board_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(32),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_cards" (
    "id" SERIAL NOT NULL,
    "column_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "priority" VARCHAR(32) NOT NULL DEFAULT 'medium',
    "due_date" TIMESTAMP(3),
    "assignee_id" INTEGER,
    "tags" JSONB,
    "attachments" JSONB,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheets" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'Untitled Spreadsheet',
    "row_count" INTEGER NOT NULL DEFAULT 100,
    "col_count" INTEGER NOT NULL DEFAULT 26,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spreadsheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_cells" (
    "id" SERIAL NOT NULL,
    "spreadsheet_id" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "value" TEXT,
    "formula" VARCHAR(1000),
    "format" JSONB,
    "validation" JSONB,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spreadsheet_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(32) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "metadata" JSONB,
    "uploaded_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_annotations" (
    "id" SERIAL NOT NULL,
    "media_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "annotation_type" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "start_time" DOUBLE PRECISION,
    "end_time" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "media_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whiteboards_document_id_idx" ON "whiteboards"("document_id");
CREATE INDEX "whiteboards_created_by_idx" ON "whiteboards"("created_by");
CREATE INDEX "whiteboard_elements_whiteboard_id_idx" ON "whiteboard_elements"("whiteboard_id");
CREATE INDEX "whiteboard_elements_element_type_idx" ON "whiteboard_elements"("element_type");
CREATE UNIQUE INDEX "chat_rooms_document_id_key" ON "chat_rooms"("document_id");
CREATE INDEX "chat_messages_room_id_idx" ON "chat_messages"("room_id");
CREATE INDEX "chat_messages_user_id_idx" ON "chat_messages"("user_id");
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");
CREATE INDEX "task_boards_document_id_idx" ON "task_boards"("document_id");
CREATE INDEX "task_columns_board_id_idx" ON "task_columns"("board_id");
CREATE INDEX "task_cards_column_id_idx" ON "task_cards"("column_id");
CREATE INDEX "task_cards_assignee_id_idx" ON "task_cards"("assignee_id");
CREATE INDEX "task_cards_position_idx" ON "task_cards"("position");
CREATE INDEX "spreadsheets_document_id_idx" ON "spreadsheets"("document_id");
CREATE UNIQUE INDEX "spreadsheet_cells_spreadsheet_id_row_col_key" ON "spreadsheet_cells"("spreadsheet_id", "row", "col");
CREATE INDEX "spreadsheet_cells_spreadsheet_id_idx" ON "spreadsheet_cells"("spreadsheet_id");
CREATE INDEX "spreadsheet_cells_row_col_idx" ON "spreadsheet_cells"("row", "col");
CREATE INDEX "media_files_document_id_idx" ON "media_files"("document_id");
CREATE INDEX "media_files_file_type_idx" ON "media_files"("file_type");
CREATE INDEX "media_annotations_media_id_idx" ON "media_annotations"("media_id");
CREATE INDEX "media_annotations_user_id_idx" ON "media_annotations"("user_id");
CREATE INDEX "media_annotations_annotation_type_idx" ON "media_annotations"("annotation_type");

-- AddForeignKey
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whiteboard_elements" ADD CONSTRAINT "whiteboard_elements_whiteboard_id_fkey" FOREIGN KEY ("whiteboard_id") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_elements" ADD CONSTRAINT "whiteboard_elements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_boards" ADD CONSTRAINT "task_boards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "task_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_cards" ADD CONSTRAINT "task_cards_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "task_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_cards" ADD CONSTRAINT "task_cards_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_cards" ADD CONSTRAINT "task_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spreadsheet_cells" ADD CONSTRAINT "spreadsheet_cells_spreadsheet_id_fkey" FOREIGN KEY ("spreadsheet_id") REFERENCES "spreadsheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spreadsheet_cells" ADD CONSTRAINT "spreadsheet_cells_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_annotations" ADD CONSTRAINT "media_annotations_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_annotations" ADD CONSTRAINT "media_annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
