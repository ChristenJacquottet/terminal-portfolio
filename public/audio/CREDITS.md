# Audio Credits & Licences

Every audio file in `public/audio/` comes from a verified **CC0 1.0 Universal** or **Public Domain** source. All other cues (`key`, `keyReturn`, `keySpace`, `click`, `switch`, `diskInsert`, `diskRead`, `diskEject`, `lidOpen`, `lidClose`, `tap`, `clapper`, `spin`, `boot`, and the `hum` loop) are synthesised directly in the browser with the Web Audio API (`src/audio.ts` + `src/audio-engine.ts`).

The ambient distance low-pass and volume-ducking curve (`audio.setInside`) is adapted from [`henryjeff/portfolio-website`](https://github.com/henryjeff/portfolio-website) (`src/Application/Audio/AudioSources.ts`), Copyright (c) 2022–2024 Henry Heffernan, licensed under the **MIT License** (code pattern only; zero audio files from that repository are used).

## Bundled Audio Files (`public/audio/`)

| File | Cue / Loop | Original Work & Source URL | Author | Licence |
| :--- | :--- | :--- | :--- | :--- |
| `room.mp3` | `loop("room")` | ["Rain against the Window"](https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg) (PDSounds #389), trimmed to a 26 s crossfaded mono loop | `cori` (via PDSounds / Wikimedia Commons) | Public Domain / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tape-insert.mp3` | `tapeInsert` | ["Car Stereo Tapedeck"](https://commons.wikimedia.org/wiki/File:Car_stereo_tapedeck.ogg) (PDSounds, `0.20s–0.72s`) | `stephan` (via PDSounds / Wikimedia Commons) | Public Domain / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tape-button.mp3` | `tapeButton` (variant 1) | ["Car Stereo Tapedeck"](https://commons.wikimedia.org/wiki/File:Car_stereo_tapedeck.ogg) (PDSounds, `5.70s–6.06s`) | `stephan` (via PDSounds / Wikimedia Commons) | Public Domain / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tape-button-2.mp3` | `tapeButton` (variant 2) | ["Car Stereo Tapedeck"](https://commons.wikimedia.org/wiki/File:Car_stereo_tapedeck.ogg) (PDSounds, `3.17s–3.41s`) | `stephan` (via PDSounds / Wikimedia Commons) | Public Domain / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `phone-up.mp3` | `phoneUp` | ["Telephone"](https://commons.wikimedia.org/wiki/File:Telephone.ogg) (`1.64s–2.18s`, cradle hookswitch & handset lift) | `Dsw4` (Wikimedia Commons) | Public Domain |
| `phone-down.mp3` | `phoneDown` | ["tone dialling phone, germany"](https://commons.wikimedia.org/wiki/File:Tone_dialling_phone_germany.ogg) (PDSounds, `17.29s–17.95s`, cradle hang-up) | `stephan` (via PDSounds / Wikimedia Commons) | Public Domain / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `paper.mp3` | `paper` | ["turning a page"](https://commons.wikimedia.org/wiki/File:Turning_a_page.ogg) (PDSounds #304, `1.46s–2.38s`) | `planish` (via PDSounds / Wikimedia Commons) | Public Domain / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `shutter.mp3` | `shutter` | ["Auslösegeräusch SLR Serienaufnahme mit AF Schärfepriorität"](https://commons.wikimedia.org/wiki/File:Ausl%C3%B6seger%C3%A4usch_SLR_Serienaufnahme_mit_AF_Sch%C3%A4rfepriorit%C3%A4t.ogg) (`7.71s–8.06s`) | `Smial` (Wikimedia Commons) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `music.mp3` | `music(true)` | ["Synth Wave"](https://opengameart.org/content/synth-wave) (lazy-loaded on Walkman play) | Alex McCulloch (`Pro Sensory` on OpenGameArt) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
