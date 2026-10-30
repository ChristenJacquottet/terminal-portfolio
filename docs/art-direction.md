# Art direction: the desk

The brief every prop, texture, light and sound follows. If something doesn't fit these rules, change it or leave it out.

## The scene: 2 AM, 1983

My room, the middle of the night, sometime in the early eighties. I've just stepped away from the Apple II; the lamp is still on, the tea is still warm, the tape is still in the Walkman. Outside, the city is asleep and blue. The only real light is the lamp bulb and the green glow of the screen.

References: David's bedroom in *WarGames* (a kid, a modem, the screen as the light), the garage benches in *Halt and Catch Fire* (opened machines, floppies, printouts), the practical lights in *Stranger Things*. For craft and interaction: c-na.dev (study only: nothing from it is used). Henry Heffernan and Edward Hinrichsen (MIT code) for sound and the screen.

The desk tells the tagline, *from imagination to implementation*, left to right:

- **Left, imagination:** the camera, the Super 8, the clapper, the globe and the cork board of places (Réunion, Guyane, Normandie, Indiana, London, Dallas), a sketchbook.
- **Centre, the work:** the Apple II, the floppies (one per project), the notebook.
- **Right, implementation:** the phone (contact), a breadboard and wires, the Walkman and tapes, the mug, the cube.

## Why it has to look like one set

c-na.dev's props come from different makers and still look like one room. The method, which we follow:

1. **One palette.** Every material is one of the swatches in `art/palette.json`. Scanned or photographic textures are flattened towards their swatch (keep the wear, lose the noise and the stray colours).
2. **Big shapes first.** A prop must read from the wide shot by its outline and two or three colour blocks. Detail lives in textures, not in triangles. Small edges are bevelled so they catch a thin highlight.
3. **Materials in bands.** Paper and fabric 0.85–0.95 roughness, wood 0.55–0.7, plastics 0.4–0.55, keycaps and glossy plastic 0.3, metal 0.3–0.45 with metalness 1 (only small parts). Nothing is mirror-shiny except glass.
4. **Texture density by distance.** Hero props (Apple II, floppies, phone, Walkman, notebook) up to 1024 px. Everything else 256–512 px.
5. **Things touch.** Cables reach sockets, the tape sits in the Walkman, the receiver sits in its cradle, papers overlap. Nothing floats, nothing is spaced out like a catalogue.
6. **Motion obeys the object.** A lid opens on its hinge, a disk slides into its slot, the clapper snaps shut. Every movable part keeps a named pivot (don't flatten it away in the build).

## Light

- **Lamp:** warm (`#ffb36b`), from the bulb, switchable. The main key light.
- **Screen:** the terminal theme's foreground colour, low and soft, on the keyboard, the desk in front and anyone's face. Change theme, the room changes colour.
- **Window:** cool night fill (`#6f8fc7`), dim, from outside. City lights, maybe rain on the glass.
- **Everything else** is barely there: just enough fill that shadowed faces aren't black.
- Exposure stays readable. Dark is a mood, not a hiding place: every prop must still read.

## Interaction

- Hover: a pointer cursor, a soft rim highlight and a small label chip. Navigation props get a stronger cue than toys.
- Click: an object-specific motion of 0.3–1.2 s with a damped spring. Props that lead somewhere also move the camera to a close view; Escape or Back returns.
- Every action can also be done from the terminal; the desk is a shortcut, never the only door.
- The scene only draws while something moves.

## Sound

Mechanical and quiet: key clicks, the disk drive, switches, the tape. Synthesised in the browser or CC0. Off until the visitor's first click, one `sound on|off` command and a mute button, ducked and muffled when you're inside the screen.
