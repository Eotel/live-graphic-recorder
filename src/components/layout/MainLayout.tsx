/**
 * Main two-panel layout for the Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  header: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  footer: ReactNode;
  className?: string;
}

export function MainLayout({ header, leftPanel, rightPanel, footer, className }: MainLayoutProps) {
  return (
    <div className={cn("flex flex-col h-screen w-full max-w-7xl mx-auto", className)}>
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">{header}</header>

      {/* Main content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left panel - Summary */}
        <div className="flex-1 md:w-1/2 overflow-y-auto border-r border-border bg-background p-4">
          {leftPanel}
        </div>

        {/* Right panel - Camera + Graphics */}
        <div className="flex-1 md:w-1/2 overflow-y-auto bg-background p-4">{rightPanel}</div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 px-4 py-3 border-t border-border bg-card">{footer}</footer>
    </div>
  );
}
