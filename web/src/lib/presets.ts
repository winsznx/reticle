import { designs, verifiedDesignIds, webSession, type DesignFile } from "./data";

export interface Preset {
  id: string;
  title: string;
  formula: string;
  w: 8 | 16 | 32;
  frames: 1 | 2 | 4 | 8;
  liveVerified: boolean;
}

const showAll = import.meta.env.VITE_SHOW_UNVERIFIED === "1";

const all: Preset[] = designs
  .filter((d: DesignFile) => d.kind === "formula" && d.formula)
  .map((d) => ({
    id: d.id,
    title: d.title,
    formula: d.formula!,
    w: d.w as Preset["w"],
    frames: d.frames as Preset["frames"],
    liveVerified: verifiedDesignIds.has(d.id),
  }));

/* A preset is only offered once its circuit has been taped out and verified against the chain. */
export const PRESETS: Preset[] = all.filter((p) => p.liveVerified || showAll);
export const drawPathVerified = designs.some((d) => d.kind === "drawn" && verifiedDesignIds.has(d.id)) || webSession !== null || showAll;
