// A tiny event bus between the terminal (DOM, always loaded) and the desk (three.js, loaded on
// `exit`). Either side can emit; a listener that isn't there yet simply misses the event, so
// anything that must survive a late desk reads state instead (see `last`).
//
// Names are "area:verb": "project:hover", "project:open", "contact:open", "coffee:refill",
// "desk:look", "desk:caption", "power:cut". Payloads are plain objects.
type Handler = (payload: Record<string, unknown>) => void;

const handlers = new Map<string, Set<Handler>>();
const last = new Map<string, Record<string, unknown>>();

export const bus = {
  on(name: string, fn: Handler): () => void {
    let set = handlers.get(name);
    if (!set) handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  },
  emit(name: string, payload: Record<string, unknown> = {}) {
    last.set(name, payload);
    handlers.get(name)?.forEach((fn) => fn(payload));
  },
  /** The most recent payload of `name`, for a listener that arrived late. */
  last(name: string): Record<string, unknown> | undefined {
    return last.get(name);
  },
};
