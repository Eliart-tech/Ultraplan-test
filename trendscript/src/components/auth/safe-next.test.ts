import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths with their query and hash", () => {
    expect(safeNextPath("/historique")).toBe("/historique");
    expect(safeNextPath("/?script=abc")).toBe("/?script=abc");
    expect(safeNextPath("/reglages#sources")).toBe("/reglages#sources");
  });

  it("falls back to / when missing or empty", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example/path")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects control characters that browsers strip", () => {
    expect(safeNextPath("/\n/evil.example")).toBe("/");
    expect(safeNextPath("/\t/evil.example")).toBe("/");
  });

  it("never loops back to the login page or to an API route", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/historique")).toBe("/");
    expect(safeNextPath("/api/sources")).toBe("/");
    expect(safeNextPath("/api")).toBe("/");
  });

  it("rejects oversized values", () => {
    expect(safeNextPath(`/${"a".repeat(2100)}`)).toBe("/");
  });
});
