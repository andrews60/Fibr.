"use client";

import type { ComponentProps } from "react";
import Model from "react-body-highlighter";
import type { MuscleStatus } from "@/lib/recovery";

type ModelProps = ComponentProps<typeof Model>;

// Index 0 = red (fatigued), 1 = yellow (recovering), 2 = green (ready)
const COLORS = ["#ef4444", "#eab308", "#22c55e"];

function level(recovery: number) {
  if (recovery < 50) return 1;
  if (recovery < 90) return 2;
  return 3;
}

type Props = {
  statuses: MuscleStatus[];
  onSelect: (muscle: string) => void;
};

export default function BodyMap({ statuses, onSelect }: Props) {
  // The library colors each muscle by "frequency", so we use it as our color level
  const data = statuses.map((s) => ({
    name: s.label,
    muscles: [s.muscle],
    frequency: level(s.recovery),
  })) as unknown as ModelProps["data"];

  return (
    <div className="body-map flex justify-center gap-8">
      {(["anterior", "posterior"] as const).map((side) => (
        <div key={side} className="flex flex-col items-center gap-2">
          <Model
            type={side as ModelProps["type"]}
            data={data}
            highlightedColors={COLORS}
            bodyColor="#3f3f46"
            onClick={({ muscle }) => onSelect(muscle)}
            style={{ width: "9.5rem" }}
          />
          <span className="fibr-label">{side === "anterior" ? "Front" : "Back"}</span>
        </div>
      ))}
    </div>
  );
}