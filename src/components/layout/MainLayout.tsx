/**
 * Main two-panel layout for the Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx, src/components/ui/resizable.tsx
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

interface MainLayoutProps {
  header: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  footer: ReactNode;
  className?: string;
}

export function MainLayout({ header, leftPanel, rightPanel, footer, className }: MainLayoutProps) {
  return (
    <div className={cn("flex flex-col h-screen w-full", className)}>
      {/* Header */}
      <header className="flex-shrink-0 px-3 py-2 border-b border-border bg-card">{header}</header>

      {/* Main content - stacked on mobile, side-by-side with resize on md+ */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Mobile: stacked layout */}
        <div className="flex flex-col flex-1 md:hidden overflow-hidden">
          <div className="flex-1 overflow-hidden border-b border-border bg-background p-4">
            {leftPanel}
          </div>
          <div className="flex-1 overflow-y-auto bg-background p-4">{rightPanel}</div>
        </div>

        {/* Desktop: resizable panels */}
        <ResizablePanelGroup id="main-layout" direction="horizontal" className="hidden md:flex">
          <ResizablePanel id="left-panel" defaultSize={40} minSize={20} maxSize={80}>
            <div className="h-full overflow-hidden bg-background p-4">{leftPanel}</div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="right-panel" defaultSize={60} minSize={20} maxSize={80}>
            <div className="h-full overflow-hidden bg-background">{rightPanel}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 px-3 py-2 border-t border-border bg-card">{footer}</footer>
    </div>
  );
}
