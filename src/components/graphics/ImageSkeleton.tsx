/**
 * Skeleton component for image generation loading state.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/graphics/ImageCarousel.tsx, src/components/ui/skeleton.tsx
 */

import { ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface ImageSkeletonProps {
  isRetrying?: boolean;
  className?: string;
}

export function ImageSkeleton({ isRetrying = false, className }: ImageSkeletonProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("relative aspect-video bg-muted rounded-lg overflow-hidden", className)}>
      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
        <ImageIcon className="size-12 mb-2 opacity-50" />
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">
            {isRetrying ? t("graphics.retrying") : t("graphics.generatingImage")}
          </span>
        </div>
      </div>

      {/* Shimmer overlay */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
      </div>
    </div>
  );
}
