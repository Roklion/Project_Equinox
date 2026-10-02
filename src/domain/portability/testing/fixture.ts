import type { ExportBundle } from "../bundle";

export function exportFixture(): ExportBundle {
  return { format: "equinox-canonical", version: 1, generatedAt: "2026-01-01T00:00:00.000Z", data: {
    household: { id: "h", name: "Sample household", currency: "USD" },
    owners: [{ id: "ob", name: "Owner B" }, { id: "oa", name: "Owner A" }],
    classifications: [{ id: "group", dimension: "customGroup", label: "Sample group" }, { id: "asset", dimension: "assetClass", label: "Sample asset" }],
    investments: [
      { id: "b", name: "Sample B", status: "closed", closedOn: "2024-02-29", ownerIds: ["oa"], groupIds: ["group"], classifications: {} },
      { id: "a", name: "Sample A", status: "active", closedOn: null, ownerIds: ["ob", "oa"], groupIds: ["group"], classifications: { assetClass: "asset" } },
    ], actions: [
      { id: "c", kind: "contribution", effectiveDate: "2023-01-01", amount: "9999999999999999.99", source: "manual", notes: "Synthetic note", movements: [{ id: "mc", investmentId: "a", role: "external", direction: "in", amount: "9999999999999999.99" }] },
      { id: "t", kind: "transfer", effectiveDate: "2023-06-01", amount: "25.25", movements: [{ id: "ms", investmentId: "a", role: "source", direction: "out", amount: "25.25" }, { id: "md", investmentId: "b", role: "destination", direction: "in", amount: "25.25" }] },
      { id: "w", kind: "withdrawal", effectiveDate: "2024-02-29", amount: "20.00", movements: [{ id: "mw", investmentId: "b", role: "external", direction: "out", amount: "20.00" }] },
    ], marks: [
      { id: "m1", investmentId: "a", asOfDate: "2023-01-01", grossValue: "100.01", debt: "0.00" },
      { id: "m2", investmentId: "a", asOfDate: "2024-02-29", grossValue: "20.00", debt: "30.00" },
      { id: "m3", investmentId: "b", asOfDate: "2024-02-29", grossValue: "0.00", debt: "0.00" },
    ],
  } };
}
