import { EMPLOYER, FOLDERS, HOST, SOCIAL, STACK, USER, art, endYear, fileName, profile, projects } from "./content";
import { HOME, display, findFile, lookup, resolve, type DirNode, type Node } from "./fs";
import { isBlock, link, pad, run, s, swatch, text, type Line, type Span } from "./output";
import { THEMES, crtOn, currentTheme, isTheme, nextTheme, setCrt, setTheme } from "./themes";
import { MODEL_CREDIT } from "./credit";

export interface TermApi {
  clear(): void;
  history(): string[];
  uptime(): string;
  open(url: string): void;
  /** Leave the screen and look at the desk (loads the 3D scene). */
  stepBack(): void;
}

export interface Ctx {
  cwd: string;
  setCwd(path: string): void;
  stdin: Line[] | null;
  term: TermApi;
}

export type Command = {
  desc: string;
  usage?: string;
  hidden?: boolean;
  run(args: string[], ctx: Ctx): Line[] | void;
};

const err = (message: string): Line[] => [[s(message, "err")]];
const flags = (args: string[]) => new Set(args.filter((a) => a.startsWith("-")).flatMap((a) => [...a.slice(1)]));
const operands = (args: string[]) => args.filter((a) => !a.startsWith("-"));

const ALL_AWARDS = projects.filter((p) => p.award);
// One name column for every long listing, so piped output from several folders still lines up.
const NAME_WIDTH = Math.max(...projects.map((p) => [...fileName(p)].length)) + 2;

function entryLine(node: Node, path: string, long: boolean, nameWidth: number): Span[] {
  const shown = node.kind === "dir" ? `${node.name}/` : node.name;
  const action = node.kind === "dir" ? `ls ${display(path)}` : `cat ${display(path)}`;
  const name = run(shown, action, node.kind === "dir" ? "bright" : "fg");
  if (!long) return [name];
  const padding = s(" ".repeat(Math.max(1, nameWidth - [...shown].length)));
  if (node.kind === "file" && node.project) {
    const p = node.project;
    return [s(pad(p.year, 11), "dim"), name, padding, s(p.title), ...(p.award ? [s(`  [${p.award}]`, "accent")] : [])];
  }
  const kind = node.kind === "dir" ? `${node.children.size} items` : "file";
  return [s(pad(kind, 11), "dim"), name, padding, s(node.summary ?? "", "dim")];
}

function list(d: DirNode, path: string, opts: { long: boolean; byTime: boolean; all?: boolean }): Line[] {
  let entries = [...d.children.values()].filter((n) => opts.all || !n.name.startsWith("."));
  entries.sort((a, b) => Number(b.kind === "dir") - Number(a.kind === "dir"));
  if (opts.byTime) {
    const year = (n: Node) => (n.kind === "file" && n.project ? endYear(n.project.year) : 0);
    entries = entries.sort((a, b) => year(b) - year(a));
  }
  if (!entries.length) return [[s("(empty)", "dim")]];
  if (!opts.long) {
    const spans: Span[] = [];
    entries.forEach((node, i) => {
      if (i) spans.push(s("   "));
      spans.push(...entryLine(node, `${path}/${node.name}`, false, 0));
    });
    return [spans];
  }
  const width = Math.max(NAME_WIDTH, ...entries.map((n) => [...n.name].length + 3));
  return entries.map((node) => entryLine(node, `${path}/${node.name}`, true, width));
}

function tree(d: DirNode, path: string, prefix = ""): Line[] {
  const entries = [...d.children.values()].filter((n) => !n.name.startsWith("."));
  return entries.flatMap((node, i) => {
    const last = i === entries.length - 1;
    const branch = s(prefix + (last ? "└── " : "├── "), "dim");
    const childPath = `${path}/${node.name}`;
    const line: Line = [branch, ...entryLine(node, childPath, false, 0)];
    return node.kind === "dir" ? [line, ...tree(node, childPath, prefix + (last ? "    " : "│   "))] : [line];
  });
}

const OPEN_KEYS: Record<string, string> = {
  site: SOCIAL.site,
  portfolio: SOCIAL.site,
  github: SOCIAL.github,
  linkedin: SOCIAL.linkedin,
  youtube: SOCIAL.youtube,
  resume: SOCIAL.resume,
  book: SOCIAL.book,
  email: `mailto:${SOCIAL.email}`,
};

function openTarget(target: string, ctx: Ctx): Line[] {
  let url = OPEN_KEYS[target];
  if (!url && /^https?:\/\//.test(target)) url = target;
  if (!url) {
    const node = lookup(resolve(ctx.cwd, target)) ?? findFile(target.replace(/\/$/, ""))?.node;
    if (!node) return err(`open: ${target}: no such file. try ls, or open site`);
    if (node.kind === "dir") return err(`open: ${target}: is a directory. try ls ${target}`);
    if (!node.url) return err(`open: ${target}: nothing to open yet`);
    url = node.url;
  }
  ctx.term.open(url);
  return [[s("opening ", "dim"), link(url.replace(/^(https?:\/\/|mailto:)/, ""), url), s(" …", "dim")]];
}

function search(pattern: string): Line[] {
  const q = pattern.toLowerCase();
  const hits = projects.filter((p) => [p.title, p.summary, p.client ?? "", p.role, p.slug].join(" ").toLowerCase().includes(q));
  if (!hits.length) return err(`grep: nothing in the portfolio matches "${pattern}"`);
  return hits.map((p) => {
    const found = findFile(p.slug);
    const path = found ? display(found.path) : p.slug;
    const i = p.summary.toLowerCase().indexOf(q);
    const snippet = i < 0 ? p.title : `…${p.summary.slice(Math.max(0, i - 24), i + q.length + 36).replace(/\s+/g, " ")}…`;
    return [run(path, `cat ${path}`, "bright"), s(": ", "dim"), s(snippet)];
  });
}

function whoami(): Line[] {
  return [
    [s(profile.name.toLowerCase(), "bright"), s(` · ${profile.role.toLowerCase()} · ${EMPLOYER}, ${profile.location.split(",")[0].toLowerCase()}`)],
    [s(profile.headline.toLowerCase())],
  ];
}

export const COMMANDS: Record<string, Command> = {
  help: {
    desc: "list commands",
    run: () => {
      const visible = Object.entries(COMMANDS).filter(([, c]) => !c.hidden);
      const width = Math.max(...visible.map(([name]) => name.length)) + 3;
      return [
        [s("commands. click one, or type it. ", "dim"), s("tab", "bright"), s(" completes, ", "dim"), s("↑ ↓", "bright"), s(" walk history, ", "dim"), s("|", "bright"), s(" pipes into grep or head.", "dim")],
        [],
        ...visible.map(([name, c]): Line => [run(name, name, "accent"), s(" ".repeat(width - name.length)), s(c.desc)]),
        [],
        [s("try: ", "dim"), run("ls -l ~/shipped"), s(" · ", "dim"), run("grep voice"), s(" · ", "dim"), run("theme amber"), s(" · ", "dim"), run("exit")],
      ];
    },
  },

  whoami: { desc: "who's this", run: whoami },

  neofetch: {
    desc: "system info, with the logo",
    run: (_, ctx) => {
      const row = (k: string, v: string | Span[]): Span[] => [s(pad(k, 9), "accent"), ...(typeof v === "string" ? [s(v)] : v)];
      return [
        {
          kind: "neofetch",
          rows: art,
          info: [
            [s(`${USER}@${HOST}`, "bright")],
            [s("─".repeat(USER.length + HOST.length + 1), "dim")],
            row("os", "imagination 26.10 (implementation)"),
            row("host", profile.location.toLowerCase()),
            row("role", `${profile.role.toLowerCase()} @ ${EMPLOYER}`),
            row("stack", STACK),
            row("shell", "cjsh 1.0"),
            row("theme", `${currentTheme()}${crtOn() ? " + crt" : ""}`),
            row("uptime", ctx.term.uptime()),
            row("work", `${projects.length} case studies · ${ALL_AWARDS.length} awards`),
            row("contact", [link(SOCIAL.email, `mailto:${SOCIAL.email}`)]),
            [],
            [s("███", "dim"), s("███", "fg"), s("███", "bright"), s("███", "accent"), s("███", "err")],
          ],
        },
      ];
    },
  },

  banner: {
    desc: "the logo and the intro",
    run: () => [{ kind: "art", rows: art }, [], ...whoami()],
  },

  ls: {
    desc: "list a folder (-l details, -t newest first, -a dotfiles)",
    usage: "ls [-alt] [path]",
    run: (args, ctx) => {
      const f = flags(args);
      const target = operands(args)[0];
      const path = resolve(ctx.cwd, target);
      const node = lookup(path);
      if (!node) return err(`ls: ${target}: no such file or directory`);
      if (node.kind === "file") return [entryLine(node, path, f.has("l"), node.name.length + 2)];
      return list(node, path, { long: f.has("l"), byTime: f.has("t"), all: f.has("a") });
    },
  },

  ll: { desc: "ls -l", hidden: true, run: (args, ctx) => COMMANDS.ls.run(["-l", ...args], ctx) },

  cd: {
    desc: "change folder",
    usage: "cd [path]",
    run: (args, ctx) => {
      const target = operands(args)[0] ?? "~";
      const path = resolve(ctx.cwd, target);
      const node = lookup(path);
      if (!node) return err(`cd: ${target}: no such file or directory`);
      if (node.kind !== "dir") return err(`cd: ${target}: not a directory. try cat ${target}`);
      ctx.setCwd(path);
    },
  },

  pwd: { desc: "where am i", run: (_, ctx) => [[s(ctx.cwd)]] },

  cat: {
    desc: "read a file or case study",
    usage: "cat <file>",
    run: (args, ctx) => {
      const targets = operands(args);
      if (!targets.length) return err("cat: which file? try ls, then cat README");
      return targets.flatMap((target, i): Line[] => {
        const node = lookup(resolve(ctx.cwd, target)) ?? findFile(target)?.node;
        const gap: Line[] = i ? [[]] : [];
        if (!node) return [...gap, ...err(`cat: ${target}: no such file`)];
        if (node.kind === "dir") return [...gap, ...err(`cat: ${target}: is a directory. try ls ${target}`)];
        return [...gap, ...node.read()];
      });
    },
  },

  tree: {
    desc: "everything, as a tree",
    run: (args, ctx) => {
      const path = resolve(ctx.cwd, operands(args)[0]);
      const node = lookup(path);
      if (!node || node.kind !== "dir") return err(`tree: ${operands(args)[0] ?? "."}: not a directory`);
      return [[s(display(path), "bright")], ...tree(node, path)];
    },
  },

  open: {
    desc: "open a case study or link in a new tab",
    usage: `open <file | ${Object.keys(OPEN_KEYS).filter((k) => k !== "portfolio").join(" | ")}>`,
    run: (args, ctx) => openTarget(operands(args)[0] ?? "site", ctx),
  },

  projects: {
    desc: "the whole portfolio, by folder",
    run: () => {
      const home = lookup(HOME) as DirNode;
      const out: Line[] = [];
      for (const { dir, label } of [...FOLDERS, { dir: "archive", label: "older work, kept for the story" }]) {
        const d = home.children.get(dir);
        if (!d || d.kind !== "dir") continue;
        if (out.length) out.push([]);
        out.push([run(`~/${dir}/`, `ls -l ~/${dir}`, "bright"), s(`  ${label}`, "dim")]);
        out.push(...list(d, `${HOME}/${dir}`, { long: true, byTime: false }));
      }
      return out;
    },
  },

  awards: {
    desc: "placements and awards",
    run: () =>
      ALL_AWARDS.map((p) => {
        const found = findFile(p.slug);
        const path = found ? display(found.path) : p.slug;
        return [s(pad(p.year, 11), "dim"), run(pad(p.title, 30), `cat ${path}`, "bright"), s(`[${p.award}]`, "accent")];
      }),
  },

  contact: { desc: "email, call, resume, socials", run: (_, ctx) => COMMANDS.cat.run(["~/contact.txt"], ctx) },
  resume: { desc: "open the resume pdf", run: (_, ctx) => openTarget("resume", ctx) },
  book: { desc: "book a 30 minute call", run: (_, ctx) => openTarget("book", ctx) },
  email: { desc: "write an email", run: (_, ctx) => openTarget("email", ctx) },

  grep: {
    desc: "search the portfolio, or filter piped output",
    usage: "grep <text>   ·   ls -l ~/shipped | grep ai",
    run: (args, ctx) => {
      const pattern = operands(args).join(" ");
      if (!pattern) return err("grep: search for what? e.g. grep voice");
      if (!ctx.stdin) return search(pattern);
      const q = pattern.toLowerCase();
      return ctx.stdin.filter((line) => !isBlock(line) && text(line).toLowerCase().includes(q));
    },
  },

  head: {
    desc: "first lines of piped output",
    hidden: true,
    run: (args, ctx) => {
      const n = Number(args.find((a) => /^-?\d+$/.test(a))?.replace("-", "") ?? 10);
      return (ctx.stdin ?? []).slice(0, n);
    },
  },

  theme: {
    desc: "colour scheme (github, phosphor, amber, homebrew, pro, solarized, dracula, dos)",
    usage: "theme [name | next]",
    run: (args) => {
      const name = operands(args)[0];
      if (!name) {
        const width = Math.max(...THEMES.map((t) => t.name.length)) + 2;
        return [
          ...THEMES.map((t): Line => [
            s(t.name === currentTheme() ? "* " : "  ", "accent"),
            run(pad(t.name, width), `theme ${t.name}`, t.name === currentTheme() ? "bright" : "fg"),
            ...t.ansi.map(swatch),
            s(`  ${t.about}`, "dim"),
          ]),
          [],
          [s("usage: theme <name> · theme next · crt on|off   saved to ", "dim"), run("~/.cjshrc", "cat ~/.cjshrc", "dim")],
        ];
      }
      const target = name === "next" ? nextTheme() : name;
      if (!isTheme(target)) return err(`theme: unknown scheme '${name}'. run theme to list them`);
      setTheme(target);
    },
  },

  crt: {
    desc: "scanlines, glow and tape noise on or off",
    usage: "crt [on | off]",
    run: (args) => {
      const arg = operands(args)[0];
      const on = arg === "on" ? true : arg === "off" ? false : !crtOn();
      setCrt(on);
    },
  },

  clear: { desc: "clear the screen (ctrl+l)", run: (_, ctx) => ctx.term.clear() },
  cls: { desc: "clear", hidden: true, run: (_, ctx) => ctx.term.clear() },

  history: {
    desc: "what you typed",
    run: (_, ctx) => ctx.term.history().map((cmd, i): Line => [s(pad(String(i + 1), 5), "dim"), run(cmd)]),
  },

  echo: { desc: "print text", hidden: true, run: (args) => [[s(args.join(" "))]] },
  date: { desc: "the date", hidden: true, run: () => [[s(new Date().toString().replace(/ GMT.*$/, "").toLowerCase())]] },
  uname: {
    desc: "system name",
    hidden: true,
    run: (args) => [[s(flags(args).has("a") ? `${HOST} 26.10 cjsh-1.0 crt-${currentTheme()} dallas` : HOST)]],
  },

  man: {
    desc: "how a command works",
    usage: "man <command>",
    run: (args) => {
      const name = operands(args)[0];
      if (!name) return err("what manual page do you want? try man ls");
      const c = COMMANDS[name];
      if (!c) return err(`no manual entry for ${name}`);
      return [
        [s(name.toUpperCase(), "bright"), s(`  ${c.desc}`)],
        [s("usage  ", "dim"), s(c.usage ?? name)],
      ];
    },
  },

  sudo: {
    desc: "",
    hidden: true,
    run: (args, ctx) => {
      if (operands(args).join(" ") === "hire christen")
        return [[s("[sudo] permission granted.", "accent")], [], ...COMMANDS.cat.run(["~/contact.txt"], ctx)!];
      return [[s(`nice try. ${USER} is not in the sudoers file. this incident will be reported.`, "err")]];
    },
  },

  exit: {
    desc: "step back from the screen and look at the desk",
    run: (_, ctx) => {
      ctx.term.stepBack();
      return [[s("logout", "dim")]];
    },
  },
  logout: { desc: "", hidden: true, run: (_, ctx) => COMMANDS.exit.run([], ctx) },

  credits: {
    desc: "who made what",
    run: () => [
      [s("code, copy and case studies  ", "dim"), s(profile.name)],
      [s("3d model                     ", "dim"), link(`“${MODEL_CREDIT.title}”`, MODEL_CREDIT.url), s(` by ${MODEL_CREDIT.author}, `), link(MODEL_CREDIT.license, MODEL_CREDIT.licenseUrl)],
      [s("desk props                   ", "dim"), link("Poly Haven", "https://polyhaven.com/models"), s(" (CC0): lamp, cassette player, notepads, pens, spectacles, duck")],
      [s("fonts                        ", "dim"), s("IBM Plex Mono, VT323 (SIL Open Font License)")],
      [s("first version                ", "dim"), link("WebShell", "https://github.com/nasan016/webshell"), s(" by Nathaniel Macapinlac (MIT)")],
    ],
  },
  rm: { desc: "", hidden: true, run: () => err("rm: permission denied. everything in here shipped.") },
  vim: { desc: "", hidden: true, run: () => [[s("you're in vim now. good luck getting out. ", "dim"), run(":q")]] },
  vi: { desc: "", hidden: true, run: (_, ctx) => COMMANDS.vim.run([], ctx) },
  nano: { desc: "", hidden: true, run: (_, ctx) => COMMANDS.vim.run([], ctx) },
  emacs: { desc: "", hidden: true, run: (_, ctx) => COMMANDS.vim.run([], ctx) },
  ":q": { desc: "", hidden: true, run: () => [[s("phew.", "dim")]] },
  ":wq": { desc: "", hidden: true, run: () => [[s("phew. saved nothing.", "dim")]] },
};

/** Words `open` understands besides paths, for tab completion. */
export const OPEN_TARGETS = Object.keys(OPEN_KEYS);
