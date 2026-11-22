// `play`: the cartridges the PVM plays (src/features/games-arcade.ts). `play snake` starts one on
// the PVM: from the screen it steps back to the desk first (the same way `exit` does), and the
// desk picks it up from the bus once it's there.
import { bus } from "../bus";
import type { Command } from "../commands";
import { run, s, type Line } from "../output";

const CARTS: [string, string][] = [
  ["snake", "eat, grow, don't bite yourself"],
  ["blocks", "falling blocks: fill a row, it goes"],
  ["pong", "tennis, the 1972 way"],
];

/** High scores, as the arcade keeps them in this browser (games-screen.ts). */
function scores(): Record<string, number> {
  try {
    return (JSON.parse(localStorage.getItem("cjsh.arcade") ?? "{}") as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}

const err = (message: string): Line[] => [[s(message, "err")]];

const commands: Record<string, Command> = {
  play: {
    desc: "play a cartridge on the PVM in the lab",
    usage: "play [snake|blocks|pong]",
    run: (args, ctx) => {
      const name = args.find((a) => !a.startsWith("-"))?.toLowerCase();
      const hi = scores();
      if (!name) {
        return [
          [s("cartridges for the PVM, by the C64:", "dim")],
          ...CARTS.map(([id, what]): Line => [s("  "), run(id.padEnd(8), `play ${id}`, "bright"), s(what.padEnd(38), "dim"), s(hi[id] ? `hi ${hi[id]}` : "", "accent")]),
          ...(hi.rally ? [[s("  "), s("rally".padEnd(8)), s("the tennis ball on the desk".padEnd(38), "dim"), s(`best ${hi.rally}`, "accent")] as Line] : []),
          [s("arrows or wasd to play, space to start, esc to leave", "dim")],
        ];
      }
      if (!CARTS.some(([id]) => id === name)) return err(`play: no cartridge called ${name}. try play`);
      bus.emit("games:play", { game: name, at: Date.now() });
      // At the screen (the desk hidden or not loaded yet): step back to the desk, like `exit`.
      if (document.getElementById("desk")?.hidden !== false) {
        ctx.term.stepBack();
        return [[s(`logout · loading ${name} on the PVM`, "dim")]];
      }
      return [[s(`${name} is on the PVM. esc leaves.`, "dim")]];
    },
  },
};

export default commands;
