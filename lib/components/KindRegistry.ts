/**
 * KindRegistry — single source of truth for per-ComponentKind behaviour.
 *
 * For each kind, callers can look up:
 *   - defaultSize           — canvas placement default (used by R7 PlacementService)
 *   - validate              — narrows `unknown` → `PayloadFor<K>` or throws
 *   - serializeForContext   — produces context chunks for downstream generation
 *   - contextMimeTypes      — what shapes this kind contributes (introspection)
 *   - Renderer              — React node-body component (wired R4)
 *   - generate              — optional per-kind generator (wired R6+)
 *
 * Adding a new kind = one new file in /lib/components/kinds/ that exports a
 * KindSpec, plus one entry in /lib/components/kinds/index.ts that calls
 * register. No core changes.
 */

import type { ComponentType } from "react";
import type {
  Component,
  ComponentKind,
  PayloadContextChunk,
  PayloadFor,
} from "@/lib/types/component";

export interface GenerationInput<K extends ComponentKind = ComponentKind> {
  kind: K;
  prompt: string;
  modelId?: string;
  /** Pre-built context from ancestor components (see R6 buildContext). */
  contextChunks: PayloadContextChunk[];
}

export interface KindSpec<K extends ComponentKind = ComponentKind> {
  kind: K;
  /** Default w×h applied when this kind is spawned on the canvas. */
  defaultSize: { w: number; h: number };
  /** Validator: narrows unknown JSON into a typed payload. Throws on shape mismatch. */
  validate: (payload: unknown) => PayloadFor<K>;
  /** Produces ordered context fragments for a downstream prompt. */
  serializeForContext: (payload: PayloadFor<K>) => PayloadContextChunk[];
  /** MIME types this kind contributes when serialised. Informational. */
  contextMimeTypes: string[];
  /** Optional React renderer for the canvas node body. Wired in R4. */
  Renderer?: ComponentType<{ component: Component<K> }>;
  /** Optional per-kind generator. Wired in R6. */
  generate?: (input: GenerationInput<K>) => Promise<PayloadFor<K>>;
}

class KindRegistryImpl {
  private readonly specs = new Map<ComponentKind, KindSpec>();

  register<K extends ComponentKind>(spec: KindSpec<K>): void {
    if (this.specs.has(spec.kind)) {
      // Re-registration is allowed (HMR, tests) but warn in dev.
      // eslint-disable-next-line no-console
      if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV !== "production"
      ) {
        console.warn(
          `[KindRegistry] Re-registering kind "${spec.kind}" — last write wins.`,
        );
      }
    }
    this.specs.set(spec.kind, spec as unknown as KindSpec);
  }

  get<K extends ComponentKind>(kind: K): KindSpec<K> {
    const spec = this.specs.get(kind);
    if (!spec) {
      throw new Error(
        `[KindRegistry] No spec registered for kind "${kind}". ` +
          `Did you forget to import /lib/components/kinds at app startup?`,
      );
    }
    return spec as unknown as KindSpec<K>;
  }

  has(kind: ComponentKind): boolean {
    return this.specs.has(kind);
  }

  all(): KindSpec[] {
    return Array.from(this.specs.values());
  }

  /** Test helper — clears all registrations. Do not use in production code. */
  _reset(): void {
    this.specs.clear();
  }
}

/** Module-level singleton. Importable from both client and server code. */
export const kindRegistry = new KindRegistryImpl();

// -- Validation utilities (shared by per-kind validate fns) -----------------

export function expectObject(
  value: unknown,
  where: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[validate ${where}] expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

export function expectString(value: unknown, where: string): string {
  if (typeof value !== "string") {
    throw new Error(`[validate ${where}] expected string, got ${typeof value}`);
  }
  return value;
}

export function expectStringOpt(
  value: unknown,
  where: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return expectString(value, where);
}

export function expectNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`[validate ${where}] expected number, got ${typeof value}`);
  }
  return value;
}

export function expectNumberOpt(
  value: unknown,
  where: string,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  return expectNumber(value, where);
}

export function expectArray<T>(
  value: unknown,
  where: string,
  mapItem: (v: unknown, i: number) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`[validate ${where}] expected array, got ${typeof value}`);
  }
  return value.map(mapItem);
}

export function expectLiteral<L extends string>(
  value: unknown,
  allowed: readonly L[],
  where: string,
): L {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new Error(
      `[validate ${where}] expected one of [${allowed.join(", ")}], got ${String(value)}`,
    );
  }
  return value as L;
}
