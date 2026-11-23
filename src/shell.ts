import { bus } from "./bus";
import { COMMANDS, type Ctx } from "./commands";
import { display, findFile, lookup, resolve } from "./fs";
import { run, s, type Line } from "./output";

type Stage = string[];
type Pipeline = { stages: Stage[]; then: ";" | "&&" | null };

/** Splits a command line into pipelines (`;`, `&&`) of stages (`|`) of words, honouring quotes. */
export function parse(input: string): Pipeline[] {
  const pipelines: Pipeline[] = [];
  let stages: Stage[] = [];
  let words: string[] = [];
  let word = "";
  let quote: string | null = null;
  let inWord = false;

  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endStage = () => {
    endWord();
    if (words.length) stages.push(words);
    words = [];
  };
  const endPipeline = (then: Pipeline["then"]) => {
    endStage();
    if (stages.length) pipelines.push({ stages, then });
    stages = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) endWord();
    else if (ch === "|") endStage();
    else if (ch === ";") endPipeline(";");
    else if (ch === "&" && input[i + 1] === "&") {
      endPipeline("&&");
      i++;
    } else {
      word += ch;
      inWord = true;
    }
  }
  endPipeline(null);
  return pipelines;
}

/**
 * Tells the desk what just ran, so it can answer while you're stepped back: a project's floppy goes
 * into the drive, the phone's handset lifts (src/features/chrome-coupling.ts listens).
 */
function announce(name: string, args: string[], cwd: string) {
  const targets = args.filter((a) => !a.startsWith("-"));
  if (name === "contact" || name === "email" || name === "book" || (name === "open" && ["email", "book"].includes(targets[0]))) {
    bus.emit("contact:open", { via: name === "open" ? targets[0] : name });
    return;
  }
  if (name !== "cat" && name !== "open") return;
  for (const target of targets) {
    const path = resolve(cwd, target);
    const node = lookup(path);
    const found = node ? { path, node } : findFile(target.replace(/\/$/, ""));
    if (found?.node.kind === "file" && found.node.project) {
      bus.emit("project:open", { slug: found.node.project.slug, command: `cat ${display(found.path)}` });
      return;
    }
  }
}

/** Runs a command line and returns everything it printed. */
export function execute(input: string, ctx: Omit<Ctx, "stdin">): Line[] {
  const out: Line[] = [];
  for (const { stages, then } of parse(input)) {
    let stdin: Line[] | null = null;
    let failed = false;
    for (const [name, ...args] of stages) {
      const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
      if (!command) {
        out.push([s(`cjsh: command not found: ${name}. `, "err"), s("try ", "dim"), run("help")]);
        failed = true;
        break;
      }
      stdin = command.run(args, { ...ctx, stdin }) ?? [];
      announce(name, args, ctx.cwd);
    }
    if (stdin) out.push(...stdin);
    if (failed && then === "&&") break;
  }
  return out;
}
