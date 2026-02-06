import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Group, Panel, Separator } from "react-resizable-panels";

function logAttributes(el: HTMLElement | null, name: string) {
  if (!el) return;
  console.log(`=== ${name} Attributes ===`);
  for (const attr of el.attributes) {
    console.log(`${attr.name}: "${attr.value}"`);
  }
}

function App() {
  const hSepRef = useRef<HTMLDivElement>(null);
  const vSepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logAttributes(hSepRef.current, "Horizontal Separator");
    logAttributes(vSepRef.current, "Vertical Separator");
  }, []);

  return (
    <Group orientation="horizontal" style={{ height: "100%" }}>
      <Panel defaultSize={50} minSize={20}>
        <div style={{ background: "#e0e0e0", height: "100%", padding: 20 }}>Left Panel</div>
      </Panel>
      <Separator
        elementRef={hSepRef}
        style={{
          width: 4,
          background: "#888",
          cursor: "col-resize",
        }}
      />
      <Panel defaultSize={50} minSize={20}>
        {/* Nested vertical split */}
        <Group orientation="vertical" style={{ height: "100%" }}>
          <Panel defaultSize={50} minSize={20}>
            <div style={{ background: "#f0f0f0", height: "100%", padding: 20 }}>Right Top</div>
          </Panel>
          <Separator
            elementRef={vSepRef}
            style={{
              height: 4,
              background: "#888",
              cursor: "row-resize",
            }}
          />
          <Panel defaultSize={50} minSize={20}>
            <div style={{ background: "#d0d0d0", height: "100%", padding: 20 }}>Right Bottom</div>
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
