export type Tone = "fg" | "dim" | "bright" | "accent" | "err";

/** A run of text. `href` makes it a link; `run` makes it a button that types and runs a command. */
export type Span = { t: string; c?: Tone; href?: string; run?: string };

export type Block =
  | { kind: "art"; rows: string[]; maxHeight?: number }
  | { kind: "neofetch"; rows: string[]; info: Span[][] };

/** One line of output, or a block that renders as a unit (and is skipped by grep and head). */
export type Line = Span[] | Block;

export const s = (t: string, c?: Tone): Span => ({ t, c });
export const link = (t: string, href: string, c?: Tone): Span => ({ t, href, c });
export const run = (t: string, cmd = t, c?: Tone): Span => ({ t, run: cmd, c });

export const isBlock = (line: Line): line is Block => !Array.isArray(line);
export const text = (line: Line): string => (isBlock(line) ? "" : line.map((span) => span.t).join(""));

/** Column padding by visible width (code points, so "·" and "–" count as one). */
export const pad = (value: string, width: number): string =>
  value + " ".repeat(Math.max(0, width - [...value].length));
