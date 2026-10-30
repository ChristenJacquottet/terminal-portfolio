import { EMPLOYER, FOLDERS, OPEN, SOCIAL, fileName, profile, projects, site, type Project } from "./content";
import { link, run, s, type Line } from "./output";

export type FileNode = { kind: "file"; name: string; read: () => Line[]; url?: string; project?: Project; summary?: string };
export type DirNode = { kind: "dir"; name: string; children: Map<string, Node>; summary?: string };
export type Node = FileNode | DirNode;

export const HOME = "/home/christen";

const dir = (name: string, summary?: string): DirNode => ({ kind: "dir", name, children: new Map(), summary });
const add = (parent: DirNode, node: Node) => parent.children.set(node.name, node);
const file = (name: string, lines: () => Line[], extra: Partial<FileNode> = {}): FileNode => ({
  kind: "file",
  name,
  read: lines,
  ...extra,
});

export function projectCard(p: Project): Line[] {
  const byline = [p.client, p.role].filter(Boolean).join(" · ");
  return [
    [s(p.title, "bright"), s(`  ${p.year}`, "dim")],
    [s(byline, "dim")],
    ...(p.award ? [[s(`[${p.award}]`, "accent")]] : []),
    [],
    [s(p.summary)],
    [],
    [s("→ ", "accent"), link("read the case study", p.url), s(`  ${p.url.replace(/^https?:\/\//, "")}`, "dim")],
  ];
}

function build(): DirNode {
  const root = dir("/");
  const home = dir("home");
  const me = dir("christen");
  add(root, home);
  add(home, me);

  add(
    me,
    file("README", () => [
      [s(profile.headline, "bright")],
      [],
      [s(profile.summary)],
      [s(profile.focus.replace("—", ", "))],
      [],
      [s("start here: ", "dim"), run("ls"), s(" · ", "dim"), run("projects"), s(" · ", "dim"), run("help")],
    ]),
  );

  add(
    me,
    file("about.txt", () => profile.about.flatMap((paragraph, i) => (i ? [[], [s(paragraph)]] : [[s(paragraph)]]))),
  );

  add(
    me,
    file("contact.txt", () => [
      [s("email    ", "dim"), link(SOCIAL.email, `mailto:${SOCIAL.email}`)],
      [s("book     ", "dim"), link("30 min call", SOCIAL.book)],
      [s("resume   ", "dim"), link("pdf", SOCIAL.resume)],
      [s("linkedin ", "dim"), link(SOCIAL.linkedin.replace(/^https:\/\/(www\.)?/, ""), SOCIAL.linkedin)],
      [s("github   ", "dim"), link(SOCIAL.github.replace(/^https:\/\//, ""), SOCIAL.github)],
      [s("site     ", "dim"), link(site.url.replace(/^https:\/\//, ""), site.url)],
    ]),
  );

  add(
    me,
    file("now.txt", () => [
      [s("creative technologist at ", "fg"), s(EMPLOYER, "bright"), s(`, ${profile.location.toLowerCase()}`)],
      [s("building ", "fg"), run("crashers", "cat ~/open/crashers", "bright"), s(": invite an ai to your meeting like a coworker ", "fg"), s("[wip]", "accent")],
    ]),
  );

  const archive = dir("archive", "older work, kept for the story");
  for (const folder of FOLDERS) {
    const d = dir(folder.dir, folder.label);
    add(me, d);
  }
  add(me, archive);

  for (const p of projects) {
    const target = p.archived ? archive : (me.children.get(FOLDERS.find((f) => f.category === p.category)?.dir ?? "") as DirNode | undefined);
    if (!target) continue;
    add(target, file(fileName(p), () => projectCard(p), { url: p.url, project: p, summary: p.title }));
  }

  const open = dir("open", "open source, take these");
  for (const repo of OPEN) {
    add(
      open,
      file(
        repo.name,
        () => [
          [s(repo.name, "bright"), s(`  [${repo.status}]`, "accent")],
          [s(repo.desc)],
          [],
          repo.url
            ? [s("→ ", "accent"), link("read about it", repo.url)]
            : [s("repo goes public when v0 works. ", "dim"), s("watch ", "dim"), link("github", SOCIAL.github)],
        ],
        { url: repo.url ?? undefined, summary: repo.desc },
      ),
    );
  }
  add(me, open);

  // Empty folders (no published entries yet) are left out of listings.
  for (const [name, node] of me.children) if (node.kind === "dir" && node.children.size === 0) me.children.delete(name);
  return root;
}

export const ROOT = build();

/** Turns any user path into a normalised absolute path. */
export function resolve(cwd: string, input = "~"): string {
  let path = input.trim() || "~";
  if (path === "~" || path.startsWith("~/")) path = HOME + path.slice(1);
  else if (!path.startsWith("/")) path = `${cwd}/${path}`;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return "/" + parts.join("/");
}

export function lookup(abs: string): Node | undefined {
  let node: Node = ROOT;
  for (const part of abs.split("/").filter(Boolean)) {
    if (node.kind !== "dir") return undefined;
    const next: Node | undefined = node.children.get(part);
    if (!next) return undefined;
    node = next;
  }
  return node;
}

export const display = (abs: string) => (abs === HOME ? "~" : abs.startsWith(HOME + "/") ? "~" + abs.slice(HOME.length) : abs);

/** Finds a project file anywhere under home by name or slug, so `open ragformation` works from any folder. */
export function findFile(name: string): { path: string; node: FileNode } | undefined {
  const walk = (d: DirNode, path: string): { path: string; node: FileNode } | undefined => {
    for (const [key, child] of d.children) {
      const childPath = `${path}/${key}`;
      if (child.kind === "file" && (key === name || child.project?.slug === name)) return { path: childPath, node: child };
      if (child.kind === "dir") {
        const hit = walk(child, childPath);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  const home = lookup(HOME);
  return home?.kind === "dir" ? walk(home, HOME) : undefined;
}
