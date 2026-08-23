import { readFile } from "node:fs/promises";

const source = (relativePath) =>
    readFile(new URL(relativePath, import.meta.url), "utf8");

describe("terminated rider re-offer eligibility", () => {
    it("does not exclude Mongo riders because of termination history", async () => {
        const [broadcastSource, riderSource, controllerSource] = await Promise.all([
            source("../../services/riderAssignment.service.js"),
            source("../../services/rider.service.js"),
            source("../../controller/rider.controller.js"),
        ]);

        expect(broadcastSource).not.toContain("pastTerminations");
        expect(riderSource).not.toContain("terminatedByThisRider");
        expect(controllerSource).not.toContain("RIDER_PREVIOUSLY_TERMINATED_ORDER");
    });

    it("excludes only genuine Postgres rejections", async () => {
        const postgresSource = await source("../../services/postgres/riderBroadcast.repository.js");

        expect(postgresSource).toContain('reason:{notIn:["rider_terminated","admin_unassigned"]}');
        expect(postgresSource).not.toContain("terminations.map");
    });
});
