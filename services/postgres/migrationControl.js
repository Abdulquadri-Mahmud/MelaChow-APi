const jsonValue = (value, fallback = {}) => {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
};

export const createMigrationControl = ({ prisma, jobName, sourceName, dryRun = false }) => {
  let runId = null;
  let processed = 0;
  let rejected = 0;

  return {
    async start(metadata = {}) {
      if (dryRun) return null;
      const run = await prisma.migrationRun.create({
        data: { jobName, dryRun, metadata: jsonValue({ sourceName, ...metadata }) },
      });
      runId = run.id;
      return run;
    },

    async checkpoint() {
      if (dryRun) return null;
      return prisma.migrationCheckpoint.findUnique({
        where: { jobName_sourceName: { jobName, sourceName } },
      });
    },

    async advance(lastSourceId, increment = 1, metadata = {}) {
      processed += increment;
      if (dryRun) return;
      await prisma.migrationCheckpoint.upsert({
        where: { jobName_sourceName: { jobName, sourceName } },
        create: { jobName, sourceName, lastSourceId, processed: increment, metadata: jsonValue(metadata) },
        update: { lastSourceId, processed: { increment }, metadata: jsonValue(metadata) },
      });
      await prisma.migrationRun.update({ where: { id: runId }, data: { processedCount: { increment } } });
    },

    async reject(sourceId, error, payload) {
      rejected += 1;
      if (dryRun) return;
      await prisma.$transaction([
        prisma.migrationReject.create({
          data: {
            runId,
            sourceName,
            sourceId,
            errorCode: error?.code ? String(error.code) : null,
            errorMessage: String(error?.message || error),
            payload: jsonValue(payload, null),
          },
        }),
        prisma.migrationRun.update({ where: { id: runId }, data: { rejectedCount: { increment: 1 } } }),
      ]);
    },

    async finish(status = "completed", metadata = {}) {
      if (!dryRun && runId) {
        await prisma.migrationRun.update({
          where: { id: runId },
          data: { status, finishedAt: new Date(), metadata: jsonValue(metadata) },
        });
      }
      return { runId, processed, rejected, status };
    },
  };
};
