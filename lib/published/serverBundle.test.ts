import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Publishing died in production with
 *   "CANVAS_BACKGROUND_STYLES is not a function"
 * because the route imported parseCanvasSnapshot, and
 *   canvasSnapshot -> canvasBackgroundTheme -> @/lib/store -> canvasSnapshot
 * is a cycle that also pulls the 6k-line client store (and a PNG import) into
 * the server bundle, where one binding evaluates undefined.
 *
 * It typechecked, it built, and it only failed at runtime with a real canvas.
 * This walks the real import graph so the next person to reach for a canvas
 * helper in a route handler finds out at test time instead.
 */

const ROOT = resolve(__dirname, "../..");

/** Modules that must never reach a server route's bundle, and why. */
const FORBIDDEN: Record<string, string> = {
  "lib/store.ts": "the client canvas store (cycles, PNG imports, 6k lines)",
  "lib/canvasSnapshot.ts": "reaches the client store via canvasBackgroundTheme",
  "lib/attachments.ts": "imports the BROWSER Supabase client",
  "lib/supabase/client.ts": "the browser Supabase client",
};

const IMPORT_RE = /^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm;
/** `import type` / `export type` are erased by the compiler and cannot cycle. */
const TYPE_ONLY_RE = /^\s*(?:import|export)\s+type\s/;

function resolveAlias(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // node_modules — not our problem
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return existsSync(base) ? base : null;
}

function crawl(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const walk = (file: string, trail: string[]) => {
    if (seen.has(file)) return;
    seen.set(file, trail);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      return;
    }
    for (const m of src.matchAll(IMPORT_RE)) {
      const line = m[0];
      if (TYPE_ONLY_RE.test(line)) continue;
      const next = resolveAlias(m[1], file);
      if (next) walk(next, [...trail, file]);
    }
  };
  walk(entry, []);
  return seen;
}

describe("server publish routes keep client modules out of their bundle", () => {
  const entries = [
    "app/api/published/route.ts",
    "app/api/published/view/route.ts",
    "app/api/published/[slug]/[version]/route.ts",
  ];

  for (const entry of entries) {
    it(`${entry} pulls in no client-only module`, () => {
      const graph = crawl(resolve(ROOT, entry));
      const hits: string[] = [];

      for (const [forbidden, why] of Object.entries(FORBIDDEN)) {
        const abs = resolve(ROOT, forbidden);
        const trail = graph.get(abs);
        if (trail) {
          const chain = [...trail, abs]
            .map((f) => f.replace(`${ROOT}/`, ""))
            .join("\n     -> ");
          hits.push(`${forbidden} (${why})\n  via: ${chain}`);
        }
      }

      expect(hits, `\n${hits.join("\n\n")}\n`).toEqual([]);
    });
  }

  it("actually detects a forbidden import when one exists", () => {
    // Guards the guard: a crawl that silently resolves nothing would pass
    // every assertion above. lib/canvasSnapshot really does reach the store.
    const graph = crawl(resolve(ROOT, "lib/canvasSnapshot.ts"));
    expect(graph.has(resolve(ROOT, "lib/store.ts"))).toBe(true);
  });
});
