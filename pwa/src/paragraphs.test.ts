import { describe, expect, it } from "vitest";
import { toParagraphs } from "@shared/format";

describe("toParagraphs", () => {
  it("separates sentences of prose, keeps short detail lines together", () => {
    const text =
      "The Career Services Office is pleased to share internship opportunities at Global Research Trends.\n" +
      "Final-year students and fresh graduates are welcome to apply for these positions.\n" +
      "Venue: D Building\nDate: 16th Oct, 2026\nTime: 11:00 AM\n" +
      "Requirements:\n1+ year of design experience\nA strong portfolio";
    expect(toParagraphs(text)).toEqual([
      ["The Career Services Office is pleased to share internship opportunities at Global Research Trends."],
      ["Final-year students and fresh graduates are welcome to apply for these positions."],
      ["Venue: D Building", "Date: 16th Oct, 2026", "Time: 11:00 AM"],
      ["Requirements:", "1+ year of design experience", "A strong portfolio"],
    ]);
  });

  it("a blank line always starts a new paragraph", () => {
    expect(toParagraphs("First\n\n\nSecond")).toEqual([["First"], ["Second"]]);
  });
});
