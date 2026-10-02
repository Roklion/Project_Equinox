import { expect, it, vi } from "vitest";
import { exportFixture } from "@/domain/portability/testing/fixture";
import { createExportService } from "./export";

it("reads only the requested household through the application port and propagates failures", async () => {
  const fixture = exportFixture(); const repository = { readHousehold: vi.fn().mockResolvedValue(fixture.data) };
  const service = createExportService(repository);
  expect(JSON.parse(await service.exportHousehold("h", fixture.generatedAt))).toEqual(JSON.parse(await service.exportHousehold("h", fixture.generatedAt)));
  expect(repository.readHousehold).toHaveBeenCalledWith("h");
  await expect(service.exportHousehold("other")).rejects.toThrow("mismatch");
  repository.readHousehold.mockRejectedValueOnce(new Error("read failed"));
  await expect(service.exportHousehold("h")).rejects.toThrow("read failed");
});
