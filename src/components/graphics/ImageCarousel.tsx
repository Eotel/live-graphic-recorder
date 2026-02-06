/**
 * Swipeable image gallery for graphic recordings.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx, src/components/graphics/ImageSkeleton.tsx
 */

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImageSkeleton } from "./ImageSkeleton";
import type { GenerationPhase } from "@/types/messages";

interface GraphicImage {
  base64?: string;
  url?: string;
  prompt: string;
  timestamp: number;
}

interface ImageCarouselProps {
  images: GraphicImage[];
  isGenerating?: boolean;
  generationPhase?: GenerationPhase;
  className?: string;
}

/**
 * Get the image source URL from a GraphicImage object.
 * Supports both base64-encoded images (real-time) and URL-based images (history).
 * Returns null if no valid source is available.
 */
function getImageSrc(image: GraphicImage): string | null {
  if (image.url) return image.url;
  if (image.base64) return `data:image/png;base64,${image.base64}`;
  return null;
}

export function ImageCarousel({
  images,
  isGenerating = false,
  generationPhase = "idle",
  className,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadErrors, setLoadErrors] = useState<Set<number>>(new Set());

  // Clamp currentIndex when images array changes
  useEffect(() => {
    if (images.length === 0) {
      setCurrentIndex(0);
      setLoadErrors(new Set());
    } else if (currentIndex >= images.length) {
      setCurrentIndex(images.length - 1);
    }
  }, [images.length, currentIndex]);

  const hasImages = images.length > 0;
  const clampedIndex = Math.min(currentIndex, Math.max(0, images.length - 1));
  const currentImage = hasImages ? images[clampedIndex] : undefined;
  const showSkeleton = isGenerating && !hasImages;
  const isRetrying = generationPhase === "retrying";

  const handleImageError = (index: number) => {
    setLoadErrors((prev) => new Set(prev).add(index));
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  // Auto-advance to newest image when new images arrive
  if (currentIndex < images.length - 1 && images.length > 0) {
    // Only auto-advance if viewing the last image before the new one arrived
    // This check prevents jumping when user manually navigated
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {showSkeleton ? (
        <ImageSkeleton isRetrying={isRetrying} />
      ) : (
        <div className="group relative flex-1 min-h-0 bg-muted rounded-lg overflow-hidden">
          {hasImages && currentImage ? (
            <>
              {loadErrors.has(clampedIndex) || !getImageSrc(currentImage) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-12 mb-2" />
                  <p className="text-sm">Failed to load image</p>
                </div>
              ) : (
                <img
                  src={getImageSrc(currentImage)!}
                  alt={currentImage.prompt}
                  className="w-full h-full object-contain"
                  onError={() => handleImageError(clampedIndex)}
                />
              )}
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
                    onClick={goToPrevious}
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="size-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
                    onClick={goToNext}
                    aria-label="Next image"
                  >
                    <ChevronRight className="size-6" />
                  </Button>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="size-12 mb-2" />
              <p className="text-sm">Graphic recordings will appear here</p>
            </div>
          )}
        </div>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
          {images.map((image, index) => {
            const thumbSrc = getImageSrc(image);
            return (
              <button
                key={`${index}-${image.timestamp}`}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  "flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-colors",
                  index === clampedIndex
                    ? "border-primary"
                    : "border-transparent hover:border-muted-foreground/50",
                )}
              >
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt={`Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="size-4 text-muted-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
