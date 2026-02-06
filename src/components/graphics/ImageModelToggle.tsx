/**
 * Toggle between Gemini image generation model presets (Flash/Pro).
 *
 * Related: src/types/messages.ts, src/hooks/useMeetingSession.ts
 */

import { Zap, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageModelPreset } from "@/types/messages";

interface ImageModelToggleProps {
  value: ImageModelPreset;
  model: string;
  onChange: (preset: ImageModelPreset) => void;
  proAvailable: boolean;
  disabled?: boolean;
  className?: string;
}

export function ImageModelToggle({
  value,
  model,
  onChange,
  proAvailable,
  disabled = false,
  className,
}: ImageModelToggleProps) {
  const isDisabled = disabled;
  const toggleTooltip = `Flash（速度） / Pro（品質）\n使用中: ${model}`;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-none">画像モデル</div>
      </div>
      <div
        title={toggleTooltip}
        className={cn("inline-flex rounded-lg bg-muted p-1", isDisabled && "opacity-50")}
      >
        <button
          type="button"
          onClick={() => onChange("flash")}
          disabled={isDisabled}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === "flash"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            isDisabled && "cursor-not-allowed",
          )}
        >
          <Zap className="size-4" />
          Flash
        </button>
        <button
          type="button"
          onClick={() => onChange("pro")}
          disabled={isDisabled || !proAvailable}
          title={proAvailable ? undefined : "Proモデルが未設定です（GEMINI_IMAGE_MODEL_PRO）"}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === "pro"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            (isDisabled || !proAvailable) && "cursor-not-allowed opacity-60",
          )}
        >
          <Crown className="size-4" />
          Pro
        </button>
      </div>
    </div>
  );
}
