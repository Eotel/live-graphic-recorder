/**
 * Manual integration check for Gemini image generation.
 *
 * Usage:
 *   bun scripts/check-gemini-image.ts --preset pro
 *   bun scripts/check-gemini-image.ts --preset flash --prompt "..."
 *
 * Env:
 *   GOOGLE_API_KEY (required)
 *   GEMINI_IMAGE_MODEL_FLASH (optional)
 *   GEMINI_IMAGE_MODEL_PRO (required for --preset pro)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createGeminiService,
  getGeminiImageModelConfig,
  resolveGeminiImageModel,
} from "../src/services/server/gemini";

type Preset = "flash" | "pro";

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function detectImageExt(bytes: Uint8Array): "png" | "jpg" | "webp" | "bin" {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  // WebP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return "bin";
}

async function main() {
  const preset = (getArgValue("--preset") ?? "pro") as Preset;
  const prompt =
    getArgValue("--prompt") ??
    "会議の要点をまとめた、シンプルで読みやすいグラフィックレコーディング（日本語ラベル）";

  const modelConfig = getGeminiImageModelConfig();
  if (!process.env["GOOGLE_API_KEY"]) {
    throw new Error("GOOGLE_API_KEY が未設定です");
  }
  if (preset === "pro" && !modelConfig.pro) {
    throw new Error("GEMINI_IMAGE_MODEL_PRO が未設定です（Proプリセットを使うには必須）");
  }

  const model = resolveGeminiImageModel(preset, modelConfig);
  console.log(`[check-gemini-image] preset=${preset} model=${model}`);

  const gemini = createGeminiService({ getModel: () => model });
  const startedAt = Date.now();
  const image = await gemini.generateImage(prompt);
  const elapsedMs = Date.now() - startedAt;

  const outDir = join(process.cwd(), "data", "_checks");
  mkdirSync(outDir, { recursive: true });

  const bytes = Buffer.from(image.base64, "base64");
  const ext = detectImageExt(bytes);
  const outPath = join(outDir, `gemini-${preset}-${Date.now()}.${ext}`);
  writeFileSync(outPath, bytes);

  console.log(
    `[check-gemini-image] ok elapsedMs=${elapsedMs} bytes=${bytes.byteLength} out=${outPath}`,
  );
}

main().catch((err) => {
  console.error("[check-gemini-image] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
