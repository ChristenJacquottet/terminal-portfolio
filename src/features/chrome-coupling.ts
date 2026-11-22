// The terminal drives the desk. Stepped back, you can still type on the Apple II; when what you run
// has a thing on the desk, that thing answers: `cat` or `open` a project and its floppy flies into
// the Disk II; `contact`, `email` or `book` and the phone's handset lifts. (`theme` already relights
// the room.) The shell announces what ran on the bus (shell.ts `announce`); seated, nothing moves.
import type { Object3D } from "three";
import { bus } from "../bus";
import type { Hotspot } from "../interact";
import type { Feature } from "./types";

const coupling: Feature = {
  name: "chrome-coupling",
  onDesk(desk) {
    const away = () => !desk.seated() && !desk.framed();

    bus.on("project:open", ({ command }) => {
      if (!away() || typeof command !== "string") return;
      let disk: Object3D | null = null;
      desk.scene.traverse((o) => {
        const spot = o.userData.hotspot as Hotspot | undefined;
        if (!disk && spot?.kind === "disk" && spot.command === command) disk = o;
      });
      if (disk) desk.activate(disk, { stay: true });
    });

    bus.on("contact:open", () => {
      const phone = desk.props.get("phone");
      if (away() && phone) desk.activate(phone, { stay: true });
    });
  },
};

export default coupling;
