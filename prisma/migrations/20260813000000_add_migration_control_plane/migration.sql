CREATE TABLE "migration_runs" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "migration_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "migration_checkpoints" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "last_source_id" TEXT,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "migration_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "migration_rejects" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "migration_rejects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "migration_runs_job_name_started_at_idx" ON "migration_runs"("job_name", "started_at");
CREATE INDEX "migration_runs_status_idx" ON "migration_runs"("status");
CREATE UNIQUE INDEX "migration_checkpoints_job_name_source_name_key" ON "migration_checkpoints"("job_name", "source_name");
CREATE INDEX "migration_rejects_run_id_source_name_idx" ON "migration_rejects"("run_id", "source_name");
CREATE INDEX "migration_rejects_source_name_source_id_idx" ON "migration_rejects"("source_name", "source_id");
ALTER TABLE "migration_rejects" ADD CONSTRAINT "migration_rejects_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "migration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
