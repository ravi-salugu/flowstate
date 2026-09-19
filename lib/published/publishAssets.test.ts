import { describe, expect, it } from "vitest";
import {
  assertNoPrivateAssetReferences,
  collectPrivateAssetPaths,
  rewriteAssetReferences,
  type CopiedAsset,
} from "@/lib/published/publishAssets";
import { scrubSnapshotForPublish } from "@/lib/published/scrubSnapshot";
import type { CanvasSnapshot } from "@/lib/canvasSnapshot";

const HOST = "https://proj.supabase.co";
const signed = (p: string) =>
  `${HOST}/storage/v1/object/sign/asset-files/${p}?token=eyJhbGciOi.FAKE`;
const publicUrl = (p: string) =>
  `${HOST}/storage/v1/object/public/asset-files/${p}`;

const U = "11111111-2222-3333-4444-555555555555";
const C = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const P1 = `${U}/${C}/diagram.png`;
const P2 = `${U}/${C}/interview.mp3`;

describe("collectPrivateAssetPaths", () => {
  it("finds signed and public URLs anywhere in the tree", () => {
    const paths = collectPrivateAssetPaths({
      canvasAssets: { a: { publicUrl: signed(P1) } },
      nested: [{ deep: { modelUrl: publicUrl(P2) } }],
    });
    expect(paths).toEqual(new Set([P1, P2]));
  });

  it("finds a bare storagePath, which carries no bucket prefix", () => {
    // CanvasAsset/CanvasSkill/AudioArtifactData all store the raw path
    // alongside the URL; missing it leaves the asset uncopied.
    expect(collectPrivateAssetPaths({ storagePath: P1 })).toEqual(
      new Set([P1]),
    );
  });

  it("finds assets in artifact kinds nobody enumerated", () => {
    // The whole point of walking generically: a new artifact kind must be
    // covered on the day it is added, not the day someone remembers.
    const paths = collectPrivateAssetPaths({
      sessionArtifacts: {
        x: {
          versions: [
            { payload: { type: "some-future-kind", coverArt: signed(P1) } },
          ],
        },
      },
    });
    expect(paths).toEqual(new Set([P1]));
  });

  it("ignores unrelated URLs", () => {
    expect(
      collectPrivateAssetPaths({
        a: "https://example.com/cat.png",
        b: `${HOST}/storage/v1/object/public/other-bucket/x.png`,
      }).size,
    ).toBe(0);
  });

  it("decodes percent-encoded paths so they match the storage key", () => {
    expect(
      collectPrivateAssetPaths({ u: signed(`${U}/${C}/my%20file.png`) }),
    ).toEqual(new Set([`${U}/${C}/my file.png`]));
  });
});

describe("rewriteAssetReferences", () => {
  const copied = new Map<string, CopiedAsset>([
    [P1, { publicPath: "pub/1/abc-diagram.png", publicUrl: `${HOST}/pub/1/abc-diagram.png` }],
    [P2, { publicPath: "pub/1/def-interview.mp3", publicUrl: `${HOST}/pub/1/def-interview.mp3` }],
  ]);

  it("swaps URLs and storagePaths together, dropping the token", () => {
    const out = rewriteAssetReferences(
      { canvasAssets: { a: { publicUrl: signed(P1), storagePath: P1 } } },
      copied,
    );
    const asset = out.canvasAssets.a;
    expect(asset.publicUrl).toBe(`${HOST}/pub/1/abc-diagram.png`);
    expect(asset.storagePath).toBe("pub/1/abc-diagram.png");
    expect(JSON.stringify(out)).not.toContain("token=");
  });

  it("leaves unrelated strings untouched", () => {
    const out = rewriteAssetReferences(
      { note: "see https://example.com/x.png", n: 4, ok: true, nil: null },
      copied,
    );
    expect(out).toEqual({
      note: "see https://example.com/x.png",
      n: 4,
      ok: true,
      nil: null,
    });
  });

  it("rewrites every occurrence, including two in one string", () => {
    const out = rewriteAssetReferences(
      { html: `<img src="${signed(P1)}"><audio src="${publicUrl(P2)}">` },
      copied,
    );
    expect(out.html).toContain("pub/1/abc-diagram.png");
    expect(out.html).toContain("pub/1/def-interview.mp3");
    expect(out.html).not.toContain("asset-files");
  });
});

describe("assertNoPrivateAssetReferences", () => {
  it("passes a fully rewritten snapshot", () => {
    expect(() =>
      assertNoPrivateAssetReferences({ a: `${HOST}/pub/1/x.png` }),
    ).not.toThrow();
  });

  it("throws when a private reference survived", () => {
    // The failure this exists for: publishes fine, breaks in seven days.
    expect(() =>
      assertNoPrivateAssetReferences({ a: signed(P1) }),
    ).toThrow(/private bucket/i);
  });

  it("throws on a leftover signing token even without the bucket name", () => {
    expect(() =>
      assertNoPrivateAssetReferences({ a: `${HOST}/x/y.png?token=abc` }),
    ).toThrow(/signed-URL token/i);
  });
});

describe("scrubSnapshotForPublish", () => {
  const snapshot = {
    cards: {
      c1: { question: "q", contributorIds: [U], pendingFiles: [{ n: 1 }] },
    },
    sessionArtifacts: { a1: { versions: [{ createdByUserId: U, n: 1 }] } },
    canvasAssets: { as1: { ownerId: U, canvasId: C, storagePath: P1 } },
    uploadedAttachments: [{ name: "x.pdf", data: "BASE64".repeat(500) }],
    canvasTextLabels: { t1: { text: "keep me" } },
  } as unknown as CanvasSnapshot;

  it("removes the user-id-bearing fields it owns", () => {
    // Scrub does NOT clear the user id inside storagePath — that path is the
    // real storage key and only the asset rewrite can safely replace it. The
    // end-to-end test below is what proves the id is gone once both have run.
    const out = JSON.stringify(scrubSnapshotForPublish(snapshot));
    expect(out).not.toContain("contributorIds");
    expect(out).not.toContain("createdByUserId");
    expect(out).not.toContain("ownerId");
  });

  it("drops uploadedAttachments, which is bulk nothing renders", () => {
    const out = scrubSnapshotForPublish(snapshot) as unknown as Record<
      string,
      unknown
    >;
    expect(out.uploadedAttachments).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("BASE64");
  });

  it("keeps the actual content", () => {
    const out = scrubSnapshotForPublish(snapshot) as unknown as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(out.cards.c1.question).toBe("q");
    expect(out.canvasTextLabels.t1.text).toBe("keep me");
    expect(out.canvasAssets.as1.storagePath).toBe(P1);
  });

  it("does not mutate the owner's live snapshot", () => {
    const original = structuredClone(snapshot);
    scrubSnapshotForPublish(snapshot);
    expect(snapshot).toEqual(original);
  });
});

describe("publish pipeline end to end", () => {
  it("leaves no user id, no private bucket and no token after scrub + rewrite", () => {
    const snapshot = {
      cards: { c1: { question: "q", contributorIds: [U] } },
      canvasAssets: {
        a1: { ownerId: U, canvasId: C, storagePath: P1, publicUrl: signed(P1) },
      },
      sessionArtifacts: {
        s1: { versions: [{ createdByUserId: U, payload: { src: signed(P2) } }] },
      },
      uploadedAttachments: [{ data: "BASE64".repeat(100) }],
    } as unknown as CanvasSnapshot;

    const copied = new Map<string, CopiedAsset>([
      [P1, { publicPath: "pid/1/aa-diagram.png", publicUrl: `${HOST}/pub/pid/1/aa-diagram.png` }],
      [P2, { publicPath: "pid/1/bb-interview.mp3", publicUrl: `${HOST}/pub/pid/1/bb-interview.mp3` }],
    ]);

    const published = rewriteAssetReferences(
      scrubSnapshotForPublish(snapshot),
      copied,
    );

    expect(() => assertNoPrivateAssetReferences(published, U)).not.toThrow();

    const json = JSON.stringify(published);
    expect(json).not.toContain(U);
    expect(json).not.toContain("asset-files");
    expect(json).not.toContain("token=");
    expect(json).not.toContain("BASE64");
    expect(json).toContain("aa-diagram.png");
    expect(json).toContain("bb-interview.mp3");
  });

  it("refuses to publish when an asset was missed by the copy step", () => {
    // The dangerous case: one asset is not in the copied map, so its path (and
    // the owner's user id) survives. Publishing must fail, not ship a link
    // that breaks in a week.
    const snapshot = {
      canvasAssets: { a1: { storagePath: P1, publicUrl: signed(P1) } },
    } as unknown as CanvasSnapshot;

    const published = rewriteAssetReferences(
      scrubSnapshotForPublish(snapshot),
      new Map<string, CopiedAsset>(),
    );

    expect(() => assertNoPrivateAssetReferences(published, U)).toThrow();
  });
});
