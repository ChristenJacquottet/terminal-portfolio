// Commands for the props that change the room: `coffee` (and `make coffee`) pours another cup,
// `duck` is rubber-duck debugging. The desk listens on the bus (src/features/consequences-*.ts).
import { bus } from "../bus";
import { run, s, type Line } from "../output";
import type { Command } from "../commands";

const pour = (): Line[] => {
  bus.emit("coffee:refill", { at: Date.now() });
  return [[s("brewing… ", "dim"), s("a fresh cup is on the desk.")], [s("it's hot. ", "dim"), run("exit"), s(" to have a look.", "dim")]];
};

const DUCK = [
  "      __",
  "  ___( o)>",
  "  \\ <_. )",
  "   `---'",
];

/** Things a good rubber duck would ask, if it could. */
const QUESTIONS = [
  "what did you expect to happen?",
  "and what happened instead?",
  "read the error out loud. all of it.",
  "what changed since it last worked?",
  "can you make it happen every time?",
  "what's the smallest input that breaks it?",
  "which of your assumptions haven't you checked yet?",
  "is the code that's running the code you're reading?",
  "what does the log say just before it goes wrong?",
  "if you had to bet: which line?",
];
const QUACKS = ["quack.", "quack quack.", "quack?", "…quack.", "*tilts head* quack.", "quack. (go on.)", "*nods* quack."];

let said = 0;
let sinceQuestion = 0;
let lastQuestion = -1;

function answer(): string {
  said++;
  sinceQuestion++;
  // mostly quacks; now and then (and at least every fourth time) a real question
  if (said > 1 && (sinceQuestion >= 4 || (sinceQuestion >= 2 && Math.random() < 0.4))) {
    sinceQuestion = 0;
    let i = Math.floor(Math.random() * QUESTIONS.length);
    if (i === lastQuestion) i = (i + 1) % QUESTIONS.length;
    lastQuestion = i;
    return QUESTIONS[i];
  }
  return QUACKS[Math.floor(Math.random() * QUACKS.length)];
}

const commands: Record<string, Command> = {
  coffee: { desc: "pour another cup", run: pour },
  make: {
    desc: "",
    hidden: true,
    run(args) {
      if (args[0] === "coffee") return pour();
      if (!args.length) return [[s("make: *** No targets specified and no makefile found.  Stop.", "err")]];
      return [[s(`make: *** No rule to make target '${args[0]}'.  Stop.`, "err")], [s("try ", "dim"), run("make coffee")]];
    },
  },
  duck: {
    desc: "rubber-duck debugging",
    usage: "duck [what's wrong]",
    run(args) {
      if (!args.length) {
        said = 0;
        sinceQuestion = 0;
        return [
          ...DUCK.map((row): Line => [s(row, "bright")]),
          [],
          [s("the duck is listening. explain your bug to it, one line at a time:")],
          [s("  duck ", "dim"), s("it works on my machine but not in prod")],
        ];
      }
      return [[s("duck: ", "dim"), s(answer(), "bright")]];
    },
  },
};
export default commands;
