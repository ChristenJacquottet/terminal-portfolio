import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const LAYOUT = fileURLToPath(new URL("./src/layout.json", import.meta.url));

/**
 * Dev only: the layout editor (`?edit`) saves the desk layout straight into src/layout.json.
 * Saving doesn't reload the page, so you can keep arranging.
 */
function layoutWriter(): Plugin {
  return {
    name: "desk-layout-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__layout", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const layout = JSON.parse(body);
            if (typeof layout !== "object" || layout === null || Array.isArray(layout)) throw new Error("not a layout");
            writeFileSync(LAYOUT, `${JSON.stringify(layout, null, 2)}\n`);
            res.end("ok");
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
    handleHotUpdate({ file }) {
      if (file === LAYOUT) return [];
    },
  };
}

export default defineConfig({ plugins: [layoutWriter()] });
