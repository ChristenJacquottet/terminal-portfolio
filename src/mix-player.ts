// Spotify handles the album stream, playback rights and native controls.
import { audio } from "./audio";
import { mixTitle, type Volume } from "./mixtapes";

const albums: Record<Volume, string> = { 1: "7vdi2ftAxsHzDtXkiQCGC1", 2: "3dpnbhZjAfAl4W0lUJYNa8" };
type Controller = {
  play(): void;
  togglePlay(): void;
  destroy(): void;
  addListener(event: "ready", callback: () => void): void;
};
type EmbedAPI = {
  createController(
    node: HTMLElement,
    options: { uri: string; width: string; height: number },
    callback: (c: Controller) => void,
  ): void;
};
let apiPromise: Promise<EmbedAPI> | undefined;
function loadAPI() {
  return (apiPromise ??= new Promise<EmbedAPI>((resolve, reject) => {
    const script = document.createElement("script");
    const win = window as Window & { onSpotifyIframeApiReady?: (api: EmbedAPI) => void };
    const timeout = window.setTimeout(fail, 10000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      apiPromise = undefined;
      reject(new Error("Spotify controls unavailable"));
    }
    win.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timeout);
      resolve(api);
    };
    script.onerror = fail;
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    document.head.append(script);
  }));
}

export function createMixPlayer(host: HTMLElement, eject: () => void) {
  const panel = document.createElement("section");
  panel.className = "mix-player";
  panel.setAttribute("aria-label", "Walkman");
  panel.hidden = true;
  const mount = document.createElement("div");
  const controls = document.createElement("div");
  const link = document.createElement("a");
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Eject tape";
  button.onclick = eject;
  controls.append(link, button);
  panel.append(mount, controls);
  host.append(panel);
  let current: Volume | null = null;
  let controller: Controller | null = null;
  let generation = 0;

  function clear() {
    generation++;
    controller?.destroy();
    controller = null;
    mount.replaceChildren();
  }
  async function display(volume: Volume, autoplay: boolean) {
    clear();
    const token = generation;
    const node = document.createElement("div");
    node.textContent = "Loading Spotify…";
    mount.append(node);
    try {
      const api = await loadAPI();
      if (generation !== token) return;
      api.createController(node, { uri: "spotify:album:" + albums[volume], width: "100%", height: 152 }, (c) => {
        if (generation !== token) {
          c.destroy();
          return;
        }
        controller = c;
        c.addListener("ready", () => {
          if (autoplay && generation === token && !audio.muted) c.play();
        });
      });
    } catch {
      if (generation !== token) return;
      const frame = document.createElement("iframe");
      frame.title = mixTitle(volume);
      frame.src = "https://open.spotify.com/embed/album/" + albums[volume];
      frame.allow = "autoplay; encrypted-media";
      mount.replaceChildren(frame);
    }
  }
  audio.onChange((muted) => {
    if (muted) clear();
    else if (current) void display(current, false);
  });
  return {
    load(volume: Volume) {
      current = volume;
      link.href = "https://open.spotify.com/album/" + albums[volume];
      link.textContent = mixTitle(volume) + " on Spotify ↗";
      panel.hidden = false;
      if (!audio.muted) void display(volume, true);
    },
    toggle() {
      if (audio.muted) return;
      if (controller) controller.togglePlay();
      else mount.querySelector("iframe")?.focus();
    },
    stop() {
      current = null;
      panel.hidden = true;
      clear();
    },
  };
}
