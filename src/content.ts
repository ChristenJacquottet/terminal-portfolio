// generated.json is written by `npm run sync` from the portfolio (published projects only)
// and the profile repo (ASCII art). Hand-written content lives here.
import data from "./content/generated.json";

export type Project = (typeof data.projects)[number];

export const { profile, projects, art, site } = data;
export const syncedAt = data.syncedAt;

export const USER = "christen";
export const HOST = "imagination";
export const EMPLOYER = "LERMA/";
export const STACK = "ai · realtime voice · avatars · web ar";

/** Short file names that match the GitHub profile README. Everything else uses its slug. */
const ALIASES: Record<string, string> = {
  "invite-lerma": "world-cup-host",
  "he-gets-us-sick-of": "super-bowl-ai",
  "william-booth-ai": "william-booth",
};

export const fileName = (project: Project) => ALIASES[project.slug] ?? project.slug;

/** Folder per category; archived entries of any category go to ~/archive. */
export const FOLDERS = [
  { dir: "shipped", category: "work", label: "client work that shipped" },
  { dir: "projects", category: "project", label: "personal and team projects" },
  { dir: "demos", category: "demo", label: "product walkthroughs" },
  { dir: "tools", category: "tool", label: "tools" },
  { dir: "experiments", category: "exploration", label: "experiments and prototypes" },
] as const;

/** Open-source work. Only link a repo here once it is public. */
export const OPEN = [
  { name: "crashers", desc: "invite an ai to your meeting like a coworker", status: "wip", url: null },
  { name: "rag-crawler", desc: "crawl any site into llm-ready markdown", status: "soon", url: `${site.url}/projects/rag-crawler` },
] as const;

export const SOCIAL = {
  site: site.url,
  email: profile.email,
  book: profile.bookingUrl,
  resume: profile.resume,
  github: profile.socials.find((x) => x.label === "GitHub")?.href ?? "",
  linkedin: profile.socials.find((x) => x.label === "LinkedIn")?.href ?? "",
  youtube: profile.socials.find((x) => x.label === "YouTube")?.href ?? "",
};

/** "2024–2025" sorts by its last year. */
export const endYear = (year: string) => Number(year.match(/\d{4}(?!.*\d{4})/)?.[0] ?? 0);
