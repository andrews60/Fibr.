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
  // The library colors each muscle by its "frequency", so we use it as our color level
  const data = statuses.map((s) => ({
    name: s.label,
    muscles: [s.muscle],
    frequency: level(s.recovery),
  })) as unknown as ModelProps["data"];

  return (
    <div>
      <div className="body-map flex justify-center gap-6">
        {(["anterior", "posterior"] as const).map((side) => (
          <div key={side} className="text-center">
            <Model
              type={side as ModelProps["type"]}
              data={data}
              highlightedColors={COLORS}
              onClick={({ muscle }) => onSelect(muscle)}
              style={{ width: "9rem" }}
            />
            <p className="text-sm text-gray-500 mt-1">{side === "anterior" ? "Front" : "Back"}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-4 mt-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500"></span> Fatigued
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span> Recovering
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500"></span> Ready
        </span>
      </div>
    </div>
  );
}