import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import EntryPage from "./page";

describe("entry kind route", () => {
  it.each(["__proto__", "constructor", "toString"])("rejects inherited property name %s", async (kind) => {
    await expect(EntryPage({ params: Promise.resolve({ kind }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
