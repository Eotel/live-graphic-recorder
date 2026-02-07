/**
 * Toggle between Gemini image generation model presets (Flash/Pro).
 *
 * Related: src/types/messages.ts, src/hooks/useMeetingSession.ts
 */

import { Zap, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageModelPreset } from "@/types/messages";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const isDisabled = disabled;
  const toggleTooltip = t("graphics.tooltip", { model });

  return (
    <div
      title={toggleTooltip}
      className={cn("inline-flex rounded-lg bg-muted p-1", isDisabled && "opacity-50", className)}
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
        {t("graphics.flash")}
      </button>
      <button
        type="button"
        onClick={() => onChange("pro")}
        disabled={isDisabled || !proAvailable}
        title={proAvailable ? undefined : t("graphics.proNotConfigured")}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          value === "pro"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          (isDisabled || !proAvailable) && "cursor-not-allowed opacity-60",
        )}
      >
        <Crown className="size-4" />
        {t("graphics.pro")}
      </button>
    </div>
  );
}
