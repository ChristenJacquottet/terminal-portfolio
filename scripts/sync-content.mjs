#!/usr/bin/env node
// Pulls the terminal's content from the portfolio and the profile repo into src/content/generated.json.
//
//   node scripts/sync-content.mjs [--portfolio ../personal-portfolio] [--profile ../ChristenJacquottet]
//
// Projects go through the portfolio's own publication resolver (lib/projects.ts), so the terminal
// can only show what christenjacquottet.com publishes. Copy comes from content/site.ts, and the
// ASCII art from the profile repo's ascii-art.svg.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return path.resolve(root, i > -1 ? process.argv[i + 1] : fallback);
};
const portfolio = arg("portfolio", "../personal-portfolio");
const profileRepo = arg("profile", "../ChristenJacquottet");

const require = createRequire(path.join(portfolio, "package.json"));
const createJiti = require("jiti");
const jiti = createJiti(path.join(portfolio, "package.json"), { alias: { "@": portfolio } });

// lib/projects.ts reads content/projects relative to the working directory.
process.chdir(portfolio);
const { getPortfolioProjects } = jiti(path.join(portfolio, "lib", "projects.ts"));
const { profile, site } = jiti(path.join(portfolio, "content", "site.ts"));

const projects = getPortfolioProjects().map(({ slug, metadata: m }) => ({
  slug,
  title: m.title,
  summary: m.summary.trim(),
  category: m.category,
  archived: m.archived,
  year: m.year,
  role: m.role,
  client: m.client ?? null,
  award: m.award ?? null,
  featured: Boolean(m.featured),
  url: `${site.url}/projects/${slug}`,
}));

const svg = fs.readFileSync(path.join(profileRepo, "ascii-art.svg"), "utf8");
const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const art = [...svg.matchAll(/<tspan [^>]*>(.*?)<\/tspan>/g)].map((m) => decode(m[1]));

const out = {
  syncedAt: new Date().toISOString().slice(0, 10),
  site: { url: site.url, description: site.description },
  profile: {
    name: profile.name,
    role: profile.role,
    location: profile.location,
    email: profile.email,
    bookingUrl: profile.bookingUrl,
    resume: `${site.url}${profile.resume.pdf}`,
    headline: profile.headline,
    summary: profile.summary,
    focus: profile.focus,
    titles: profile.titles,
    about: profile.aboutBody,
    socials: profile.socials.map(({ label, href }) => ({ label, href })),
  },
  projects,
  art,
};

const file = path.join(root, "src", "content", "generated.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${path.relative(root, file)}: ${projects.length} projects, ${art.length} art rows`);
