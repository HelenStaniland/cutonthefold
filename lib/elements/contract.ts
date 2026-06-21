import { Millimetres } from "@/lib/types/measurements";

export type WaistOpening = {
  side: "left" | "right";
  length: Millimetres;
};

export type WaistEdge = {
  length: Millimetres;
  opening?: WaistOpening;
};
