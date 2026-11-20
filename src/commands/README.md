# Terminal commands from features

A file here exports `default` as `Record<string, Command>` (see `src/commands.ts`) and is merged
into the shell's commands at build time (`import.meta.glob`). The terminal bundle must stay small:
**never import three.js or anything from `src/features/` here.** Talk to the desk through
`src/bus.ts` (`bus.emit("coffee:refill")`) and let the feature listen in its `onDesk`.
