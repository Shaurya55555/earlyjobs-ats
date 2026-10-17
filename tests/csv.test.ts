import { describe, expect, it } from "vitest";
import { daysSince, parseCsv, toCsv } from "../src/lib/ats";

describe("csv", () => {
  it("round-trips commas, quotes and newlines", () => {
    const rows = [["a", 'he said "hi"', "x,y"], ["multi\nline", "", "z"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("handles CRLF and skips blank lines", () => {
    expect(parseCsv("a,b\r\n\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("neutralises formula injection", () => {
    expect(toCsv([["=1+1", "ok"]])).toBe("'=1+1,ok");
  });
});

describe("daysSince", () => {
  it("floors whole days and never goes negative", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    expect(daysSince("2026-10-15T13:00:00Z", now)).toBe(1);
    expect(daysSince("2026-10-18T00:00:00Z", now)).toBe(0);
  });
});
