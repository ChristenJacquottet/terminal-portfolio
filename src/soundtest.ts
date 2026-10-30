// Dev-only audition panel (`?soundtest`), dynamically imported so visitors never download it.
import { audio, type Cue } from "./audio";

const CUE_GROUPS: { label: string; cues: Cue[] }[] = [
  { label: "keyboard & system", cues: ["key", "keySpace", "keyReturn", "click", "switch", "boot"] },
  { label: "disk ii", cues: ["diskInsert", "diskRead", "diskEject"] },
  { label: "walkman & hinges", cues: ["tapeInsert", "tapeButton", "lidOpen", "lidClose"] },
  { label: "desk props", cues: ["phoneUp", "phoneDown", "paper", "tap", "clapper", "shutter", "spin"] },
];

const CSS = `
.soundtest {
  position: fixed;
  z-index: 10;
  right: 12px;
  bottom: 12px;
  width: min(440px, calc(100% - 24px));
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: 6px;
  font: 12px / 1.4 "IBM Plex Mono", ui-monospace, Menlo, monospace;
  color: #e6e6e6;
  background: rgba(10, 10, 12, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}
.soundtest-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.soundtest-title {
  margin: 0;
  color: #7ee787;
}
.soundtest-title span {
  color: rgba(255, 255, 255, 0.5);
}
.soundtest-group {
  margin-top: 8px;
}
.soundtest-label {
  margin: 0 0 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
.soundtest-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.soundtest button {
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 3px 7px;
  cursor: pointer;
}
.soundtest button:hover,
.soundtest button[data-on="true"] {
  background: #7ee787;
  color: #0b0b0b;
  border-color: #7ee787;
}
.soundtest button[data-flash="true"] {
  border-color: #7ee787;
  color: #7ee787;
}
.soundtest input[type="range"] {
  flex: 1;
  min-width: 110px;
  accent-color: #7ee787;
}
.soundtest-status {
  margin: 8px 0 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.58);
}
.soundtest[data-collapsed="true"] .soundtest-body {
  display: none;
}
`;

export function mountSoundTest() {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const panel = document.createElement("aside");
  panel.className = "soundtest";
  panel.setAttribute("aria-label", "Sound test panel");

  const groupsHtml = CUE_GROUPS.map(
    (g) => `
      <div class="soundtest-group">
        <p class="soundtest-label">${g.label}</p>
        <div class="soundtest-row">
          ${g.cues.map((c) => `<button type="button" data-cue="${c}">${c}</button>`).join("")}
        </div>
      </div>`,
  ).join("");

  panel.innerHTML = `
    <div class="soundtest-head">
      <p class="soundtest-title">sound test <span>· 20 cues + loops</span></p>
      <div class="soundtest-row">
        <button type="button" data-mute></button>
        <button type="button" data-collapse title="minimise">–</button>
      </div>
    </div>
    <div class="soundtest-body">
      <div class="soundtest-group">
        <p class="soundtest-label">loops & walkman</p>
        <div class="soundtest-row">
          <button type="button" data-loop="room">loop: room</button>
          <button type="button" data-loop="hum">loop: hum</button>
          <button type="button" data-music>music (walkman)</button>
        </div>
      </div>
      <div class="soundtest-group">
        <p class="soundtest-label">setInside(t) · 0 = desk, 1 = inside screen (<span data-inside-val>0.00</span>)</p>
        <div class="soundtest-row">
          <button type="button" data-inside-set="0">0 desk</button>
          <input type="range" min="0" max="1" step="0.01" value="0" data-inside aria-label="Inside screen amount" />
          <button type="button" data-inside-set="1">1 screen</button>
        </div>
      </div>
      ${groupsHtml}
      <p class="soundtest-status" data-status>click any cue to unlock & audition.</p>
    </div>
  `;

  for (const ev of ["pointerdown", "pointerup", "click", "keydown"]) {
    panel.addEventListener(ev, (e) => e.stopPropagation());
  }

  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector(sel) as T;
  const status = $<HTMLParagraphElement>("[data-status]");
  const muteBtn = $<HTMLButtonElement>("[data-mute]");
  const collapseBtn = $<HTMLButtonElement>("[data-collapse]");
  const musicBtn = $<HTMLButtonElement>("[data-music]");
  const insideSlider = $<HTMLInputElement>("[data-inside]");
  const insideVal = $<HTMLSpanElement>("[data-inside-val]");

  const say = (msg: string) => {
    status.textContent = msg;
  };

  const syncMute = (m: boolean) => {
    muteBtn.textContent = m ? "muted (click to unmute)" : "sound: on";
    muteBtn.dataset.on = String(!m);
  };
  syncMute(audio.muted);
  audio.onChange(syncMute);

  muteBtn.addEventListener("click", () => {
    const next = !audio.muted;
    audio.setMuted(next);
    if (!next) audio.play("click", { volume: 0.75 });
    say(next ? "muted: play() is now a no-op; loops paused." : "unmuted.");
  });

  collapseBtn.addEventListener("click", () => {
    const collapsed = panel.dataset.collapsed === "true";
    panel.dataset.collapsed = String(!collapsed);
    collapseBtn.textContent = collapsed ? "–" : "+";
  });

  const loopState = { room: false, hum: false };
  panel.querySelectorAll<HTMLButtonElement>("[data-loop]").forEach((btn) => {
    const name = btn.dataset.loop as "room" | "hum";
    btn.addEventListener("click", () => {
      loopState[name] = !loopState[name];
      btn.dataset.on = String(loopState[name]);
      audio.loop(name, loopState[name]);
      say(`loop("${name}", ${loopState[name]})${audio.muted ? " (currently muted)" : ""}`);
    });
  });

  let musicOn = false;
  let musicBusy = false;
  musicBtn.addEventListener("click", async () => {
    if (musicBusy) return;
    musicOn = !musicOn;
    musicBtn.dataset.on = String(musicOn);
    if (musicOn) {
      musicBusy = true;
      musicBtn.textContent = "music (loading…)";
      say("loading /audio/music.mp3…");
      await audio.music(true);
      musicBusy = false;
      musicBtn.textContent = "music (walkman)";
      say(audio.muted ? "music(true) queued (currently muted)" : "music(true): playing Walkman track");
    } else {
      await audio.music(false);
      say("music(false): stopped");
    }
  });

  const updateInside = (v: number) => {
    insideSlider.value = String(v);
    insideVal.textContent = v.toFixed(2);
    audio.setInside(v);
    say(`setInside(${v.toFixed(2)})`);
  };
  insideSlider.addEventListener("input", () => updateInside(Number(insideSlider.value)));
  panel.querySelectorAll<HTMLButtonElement>("[data-inside-set]").forEach((btn) => {
    btn.addEventListener("click", () => updateInside(Number(btn.dataset.insideSet)));
  });

  let callCount = 0;
  panel.querySelectorAll<HTMLButtonElement>("[data-cue]").forEach((btn) => {
    const cue = btn.dataset.cue as Cue;
    btn.addEventListener("click", () => {
      callCount++;
      audio.play(cue);
      btn.dataset.flash = "true";
      setTimeout(() => delete btn.dataset.flash, 140);
      say(audio.muted ? `play("${cue}") -> no-op (muted)` : `#${callCount} play("${cue}")`);
    });
  });

  document.body.append(panel);
}
