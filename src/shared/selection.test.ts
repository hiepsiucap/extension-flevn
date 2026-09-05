import { describe, expect, it } from "vitest";
import { isSavableWord, normalizeSelection } from "./selection";

describe("normalizeSelection", () => {
  it("collapses whitespace and trims the selection", () => {
    expect(normalizeSelection("  hello\n   world  ")).toBe("hello world");
  });
});

describe("isSavableWord", () => {
  it.each(["hello", "mother-in-law", "don't", "l’été", "ภาษา"])(
    "accepts a word-shaped selection: %s",
    (value) => expect(isSavableWord(value)).toBe(true),
  );

  it.each(["", "two words", "hello!", "word.", "a".repeat(101)])(
    "rejects a non-word selection: %s",
    (value) => expect(isSavableWord(value)).toBe(false),
  );
});
