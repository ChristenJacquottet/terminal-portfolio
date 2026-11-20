// Every feature under src/features/ (default export, see types.ts), found by Vite at build time.
// Add a file, it's in. Only the desk chunk imports this; the terminal never does.
import type { Feature } from "./types";

const modules = import.meta.glob<{ default?: Feature }>("./*.ts", { eager: true });

export const features: Feature[] = Object.entries(modules)
  .filter(([path]) => !/\/(index|types)\.ts$/.test(path))
  .map(([, m]) => m.default)
  .filter((f): f is Feature => Boolean(f && typeof f === "object" && typeof f.name === "string"))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Click handlers by kind, every feature's together (a later name wins a clash). */
export const featureActions: Record<string, NonNullable<Feature["actions"]>[string]> = Object.assign({}, ...features.map((f) => f.actions ?? {}));

/** Hover labels by prop name, every feature's together. */
export const featureHotspots = Object.assign({}, ...features.map((f) => f.hotspots ?? {})) as Record<string, import("../interact").Hotspot>;
