import { afterEach, describe, expect, it, vi } from "vitest";

// A stand-in for the reading engine: each test decides how recognize behaves.
const recognize = vi.fn();
const terminate = vi.fn(async () => undefined);
vi.mock("tesseract.js", () => ({ createWorker: vi.fn(async () => ({ recognize, terminate })) }));

(globalThis as unknown as { window: unknown }).window = { location: { origin: "http://localhost" } };
const { readTextFromImage, ReaderCrashedError } = await import("./ocr");

afterEach(() => recognize.mockReset());

describe("reading a screenshot when the engine crashes", () => {
  it("falls back to the plain reading with a fresh reader", async () => {
    recognize.mockRejectedValueOnce(0).mockResolvedValueOnce({ data: { text: "Plain reading" } });
    const result = await readTextFromImage(new Blob(["x"]));
    expect(result).toEqual({ text: "Plain reading", lettering: [] });
    expect(recognize).toHaveBeenCalledTimes(2);
  });

  it("says the reader stopped, with its code, when even that fails", async () => {
    recognize.mockRejectedValue(0);
    const error = await readTextFromImage(new Blob(["x"])).catch((e) => e);
    expect(error).toBeInstanceOf(ReaderCrashedError);
    expect(error.message).toMatch(/stopped unexpectedly \(code 0\).*short of memory/);
  });

  it("keeps the engine's own message when it has one", async () => {
    recognize.mockRejectedValue(new Error("Network error while fetching eng.traineddata"));
    await expect(readTextFromImage(new Blob(["x"]))).rejects.toThrow("Network error while fetching eng.traineddata");
  });
});
