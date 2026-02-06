import { describe, expect, test } from "bun:test";
import { buildContentDispositionAttachment } from "./content-disposition";

describe("buildContentDispositionAttachment", () => {
  test("includes ascii fallback and utf-8 filename", () => {
    const header = buildContentDispositionAttachment("会議レポート.zip");

    expect(header).toContain('filename="_.zip"');
    expect(header).toContain("filename*=UTF-8''");
  });

  test("sanitizes quotes and backslashes", () => {
    const header = buildContentDispositionAttachment('ab"c\\d.zip');

    expect(header).toContain('filename="ab_c_d.zip"');
  });
});
