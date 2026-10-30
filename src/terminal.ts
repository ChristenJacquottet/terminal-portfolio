import { COMMANDS, OPEN_TARGETS, type Ctx, type TermApi } from "./commands";
import { HOST, USER } from "./content";
import { HOME, display, lookup, resolve } from "./fs";
import { isBlock, type Line, type Span } from "./output";
import { execute } from "./shell";
import { THEMES, store } from "./themes";

const ART_CHAR = 0.602; // Menlo advance width, in em
const ART_LINE = 1.2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Terminal {
  cwd = HOME;
  private hist: string[];
  private hIndex = -1;
  private draft = "";
  private busy = false;
  private started = performance.now();
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Set while booting: any key or click finishes the animation at once. */
  skip = false;

  constructor(
    private term: HTMLElement,
    private output: HTMLElement,
    private promptLine: HTMLElement,
    private prompt: HTMLElement,
    private mirror: HTMLElement,
    private input: HTMLInputElement,
    private title: HTMLElement,
  ) {
    try {
      this.hist = JSON.parse(store.get("cjsh.history") ?? "[]");
      if (!Array.isArray(this.hist)) this.hist = [];
    } catch {
      this.hist = [];
    }
    this.bind();
    this.renderPrompt();
    new ResizeObserver(() => this.fitArt()).observe(this.term);
  }

  private get api(): TermApi {
    return {
      clear: () => {
        this.output.replaceChildren();
      },
      history: () => [...this.hist],
      uptime: () => {
        const t = Math.floor((performance.now() - this.started) / 1000);
        return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(t % 60).padStart(2, "0")} (this visit)`;
      },
      open: (url) => {
        if (url.startsWith("mailto:")) window.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
      },
    };
  }

  private ctx(): Omit<Ctx, "stdin"> {
    const self = this;
    return {
      get cwd() {
        return self.cwd;
      },
      setCwd: (path) => {
        this.cwd = path;
      },
      term: this.api,
    };
  }

  // ── rendering ────────────────────────────────────────────────────────────

  private span(span: Span): Node {
    const cls = span.c && span.c !== "fg" ? `c-${span.c}` : "";
    if (span.href) {
      const a = document.createElement("a");
      a.href = span.href;
      if (!span.href.startsWith("mailto:")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.textContent = span.t;
      if (cls) a.className = cls;
      return a;
    }
    if (span.run) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `run ${cls}`.trim();
      b.textContent = span.t;
      b.dataset.run = span.run;
      return b;
    }
    if (!cls) return document.createTextNode(span.t);
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = span.t;
    return el;
  }

  private art(rows: string[], maxHeight?: number): HTMLElement {
    const pre = document.createElement("pre");
    pre.className = "art";
    pre.textContent = rows.join("\n");
    pre.dataset.cols = String(Math.max(...rows.map((r) => [...r].length)));
    pre.dataset.rows = String(rows.length);
    if (maxHeight) pre.dataset.maxHeight = String(maxHeight);
    pre.setAttribute("role", "img");
    pre.setAttribute("aria-label", "ASCII art: smokestacks and trees over water");
    return pre;
  }

  private line(line: Line): HTMLElement {
    if (isBlock(line)) {
      if (line.kind === "art") return this.art(line.rows, line.maxHeight);
      const wrap = document.createElement("div");
      wrap.className = "neofetch";
      const info = document.createElement("div");
      info.append(...line.info.map((l) => this.line(l)));
      wrap.append(this.art(line.rows), info);
      return wrap;
    }
    const div = document.createElement("div");
    div.className = "line";
    div.append(...line.map((span) => this.span(span)));
    return div;
  }

  /** Sizes every ASCII art block to fill its width (and stay under its max height). */
  fitArt() {
    for (const pre of this.output.querySelectorAll<HTMLElement>(".art")) {
      const cols = Number(pre.dataset.cols);
      const rows = Number(pre.dataset.rows);
      let size = pre.clientWidth / (cols * ART_CHAR);
      const maxHeight = Number(pre.dataset.maxHeight);
      if (maxHeight) size = Math.min(size, (this.term.clientHeight * maxHeight) / (rows * ART_LINE));
      pre.style.fontSize = `${Math.max(1, size).toFixed(2)}px`;
    }
  }

  print(lines: Line[]) {
    const frag = document.createDocumentFragment();
    for (const line of lines) frag.append(this.line(line));
    this.output.append(frag);
    this.fitArt();
    this.scroll();
  }

  private promptSpans(path = this.cwd): Span[] {
    return [
      { t: `${USER}@${HOST}`, c: "accent" },
      { t: ":", c: "dim" },
      { t: display(path), c: "bright" },
      { t: "$ ", c: "accent" },
    ];
  }

  renderPrompt() {
    this.prompt.replaceChildren(...this.promptSpans().map((s) => this.span(s)));
    const where = `${USER}@${HOST}: ${display(this.cwd)}`;
    this.title.textContent = where;
    document.title = where;
    this.renderMirror();
  }

  private renderMirror() {
    const value = this.input.value;
    const at = this.input.selectionStart ?? value.length;
    const chars = [...value];
    const before = chars.slice(0, at).join("");
    const under = chars[at] ?? " ";
    const after = chars.slice(at + 1).join("");
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = under;
    this.mirror.replaceChildren(document.createTextNode(before), cursor, document.createTextNode(after));
  }

  private scroll() {
    this.term.scrollTop = this.term.scrollHeight;
  }

  focus() {
    if (document.activeElement !== this.input) this.input.focus({ preventScroll: true });
  }

  // ── running commands ─────────────────────────────────────────────────────

  submit(raw: string) {
    const cmd = raw.trim();
    this.print([[...this.promptSpans(), { t: raw }]]);
    this.input.value = "";
    this.hIndex = -1;
    if (cmd) {
      if (this.hist[this.hist.length - 1] !== cmd) this.hist.push(cmd);
      this.hist = this.hist.slice(-100);
      store.set("cjsh.history", JSON.stringify(this.hist));
      this.print(execute(cmd, this.ctx()));
    }
    this.renderPrompt();
    this.scroll();
  }

  /** Types a command into the prompt like a person would, then runs it. */
  async type(cmd: string, speed = 38) {
    if (this.busy) return;
    this.busy = true;
    this.input.value = "";
    for (const ch of cmd) {
      if (this.skip || this.reduced) break;
      this.input.value += ch;
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
      this.renderMirror();
      await sleep(speed + Math.random() * speed);
    }
    this.input.value = cmd;
    this.renderMirror();
    await this.pause(180);
    this.submit(cmd);
    this.busy = false;
  }

  pause(ms: number) {
    return this.skip || this.reduced ? Promise.resolve() : sleep(ms);
  }

  // ── completion ───────────────────────────────────────────────────────────

  private complete() {
    const value = this.input.value;
    const words = value.split(/\s+/);
    const last = words[words.length - 1];
    const command = words.length > 1 ? words[0] : null;

    let options: string[];
    if (!command) {
      options = Object.entries(COMMANDS)
        .filter(([name, c]) => !c.hidden && name.startsWith(last))
        .map(([name]) => `${name} `);
    } else if (command === "theme") {
      options = [...THEMES.map((t) => t.name), "next"].filter((n) => n.startsWith(last)).map((n) => `${n} `);
    } else if (command === "man") {
      options = Object.keys(COMMANDS).filter((n) => !COMMANDS[n].hidden && n.startsWith(last)).map((n) => `${n} `);
    } else {
      const slash = last.lastIndexOf("/");
      const dirPart = slash >= 0 ? last.slice(0, slash + 1) : "";
      const base = last.slice(slash + 1);
      const node = lookup(resolve(this.cwd, dirPart || "."));
      options =
        node?.kind === "dir"
          ? [...node.children.values()]
              .filter((n) => n.name.startsWith(base))
              .map((n) => `${dirPart}${n.name}${n.kind === "dir" ? "/" : " "}`)
          : [];
      if (command === "open" && !dirPart) options.push(...OPEN_TARGETS.filter((k) => k.startsWith(base)).map((k) => `${k} `));
    }

    if (!options.length) return;
    const head = words.slice(0, -1).join(" ") + (words.length > 1 ? " " : "");
    if (options.length === 1) {
      this.input.value = head + options[0];
    } else {
      let prefix = options[0];
      for (const o of options) while (!o.startsWith(prefix)) prefix = prefix.slice(0, -1);
      if (prefix.length > last.length) this.input.value = head + prefix;
      else {
        this.print([[...this.promptSpans(), { t: value }]]);
        this.print([[{ t: options.map((o) => o.trim().split("/").filter(Boolean).pop() + (o.endsWith("/") ? "/" : "")).join("   "), c: "dim" }]]);
      }
    }
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    this.renderMirror();
  }

  // ── input ────────────────────────────────────────────────────────────────

  private bind() {
    const input = this.input;

    input.addEventListener("keydown", (e) => {
      if (this.busy) {
        this.skip = true;
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit(input.value);
      } else if (e.key === "Tab") {
        e.preventDefault();
        this.complete();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!this.hist.length) return;
        if (this.hIndex === -1) this.draft = input.value;
        const up = e.key === "ArrowUp";
        this.hIndex = up
          ? this.hIndex === -1
            ? this.hist.length - 1
            : Math.max(0, this.hIndex - 1)
          : this.hIndex === -1 || this.hIndex >= this.hist.length - 1
            ? -1
            : this.hIndex + 1;
        input.value = this.hIndex === -1 ? this.draft : this.hist[this.hIndex];
        input.setSelectionRange(input.value.length, input.value.length);
      } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        this.output.replaceChildren();
      } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
        if (input.selectionStart !== input.selectionEnd) return; // let copy work
        e.preventDefault();
        this.print([[...this.promptSpans(), { t: input.value }, { t: "^C", c: "dim" }]]);
        input.value = "";
      } else if (e.ctrlKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        input.value = "";
      }
      requestAnimationFrame(() => this.renderMirror());
    });

    for (const ev of ["input", "select", "click", "keyup"]) input.addEventListener(ev, () => this.renderMirror());
    input.addEventListener("focus", () => this.promptLine.classList.add("focused"));
    input.addEventListener("blur", () => this.promptLine.classList.remove("focused"));

    this.term.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest<HTMLElement>("button.run");
      if (button?.dataset.run) {
        if (this.busy) {
          this.skip = true;
          return;
        }
        void this.type(button.dataset.run, 14);
        this.focus();
        return;
      }
      if (target.closest("a")) return;
      if (window.getSelection()?.toString()) return; // let people copy text
      this.focus();
    });

    document.addEventListener("keydown", (e) => {
      if (this.busy) this.skip = true;
      if (document.activeElement !== input && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) this.focus();
    });
  }
}
