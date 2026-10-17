import { describe, expect, it } from "vitest";
import { candidateInput, canMove, parseSkills } from "../src/lib/ats";

describe("canMove", () => {
  it("allows forward moves and rejection", () => {
    expect(canMove("Applied", "Screening")).toBe(true);
    expect(canMove("Interview", "Rejected")).toBe(true);
    expect(canMove("Screening", "Offer")).toBe(true);
  });
  it("blocks no-ops and leaving Hired", () => {
    expect(canMove("Applied", "Applied")).toBe(false);
    expect(canMove("Hired", "Interview")).toBe(false);
  });
  it("only reopens rejected candidates to early stages", () => {
    expect(canMove("Rejected", "Screening")).toBe(true);
    expect(canMove("Rejected", "Offer")).toBe(false);
  });
});

describe("candidateInput", () => {
  it("normalises email and applies defaults", () => {
    const r = candidateInput.parse({ name: " A ", email: " A@B.com ", role: "Dev" });
    expect(r.email).toBe("a@b.com");
    expect(r.stage).toBe("Applied");
    expect(r.skills).toEqual([]);
  });
  it("rejects bad email and missing name", () => {
    const r = candidateInput.safeParse({ name: "", email: "nope", role: "Dev" });
    expect(r.success).toBe(false);
  });
});

describe("parseSkills", () => {
  it("splits, trims and dedupes", () => {
    expect(parseSkills("React, Node ,React,,")).toEqual(["React", "Node"]);
  });
});
