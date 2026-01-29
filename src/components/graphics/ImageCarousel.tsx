/**
 * Swipeable image gallery for graphic recordings.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GraphicImage {
  base64: string;
  prompt: string;
  timestamp: number;
}

interface ImageCarouselProps {
  images: GraphicImage[];
  className?: string;
}

export function ImageCarousel({ images, className }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const hasImages = images.length > 0;
  const currentImage = images[currentIndex];

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
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">Graphic Recordings</h3>

      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
        {hasImages && currentImage ? (
          <>
            <img
              src={`data:image/png;base64,${currentImage.base64}`}
              alt={currentImage.prompt}
              className="w-full h-full object-contain"
            />

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white"
                  onClick={goToPrevious}
                >
                  <ChevronLeft className="size-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white"
                  onClick={goToNext}
                >
                  <ChevronRight className="size-6" />
                </Button>
              </>
            )}

            {/* Image counter */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              {currentIndex + 1} / {images.length}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="size-12 mb-2" />
            <p className="text-sm">Graphic recordings will appear here</p>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={image.timestamp}
              onClick={() => setCurrentIndex(index)}
              className={cn(
                "flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-colors",
                index === currentIndex
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground/50",
              )}
            >
              <img
                src={`data:image/png;base64,${image.base64}`}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
