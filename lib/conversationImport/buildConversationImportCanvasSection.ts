import type { ArtifactPayload } from "@/lib/artifactTypes";
import type { SessionArtifact } from "@/lib/sessionArtifacts";
import type {
  CanvasArtifactNode,
  Card,
  Connection,
  Thread,
  ThreadGist,
} from "@/lib/store";
import { normalizeTableArtifactData } from "@/lib/tableArtifact";
import { normalizeTodoArtifactData } from "@/lib/todoArtifact";
import {
  claimPayload,
  definitionPayload,
  linkGroupPayload,
  mechanismPayload,
  quotePayload,
  statPayload,
} from "@/lib/transcriptArtifacts";
import { layoutChapters } from "@/lib/transcriptImport/chapterLayout";
import {
  conn,
  convCard,
  spawnPayload,
  spawnWebsite,
  thread,
  threadGist,
  type TranscriptImportCanvasSection,
} from "@/lib/transcriptImport/playgroundLayout";
import type {
  ConversationImportSpec,
  ImportArtifactSpec,
} from "@/lib/conversationImport/spec";

/*
 * Spec → canvas. The same content helpers and chapter engine as the
 * hand-authored transcript canvases, so an imported conversation is laid out
 * exactly like them: one chapter per key question, follow-ups as branch rows,
 * the chapter's artifacts in justified rows underneath, sources in the
 * masthead. Nothing here positions anything — layoutChapters does.
 */

const GIST_MAX = 320;

export interface ConversationImportBuildOptions {
  /**
   * Prefix for every node, thread and group id. Two imports into one canvas
   * must not collide, so in-canvas imports pass a fresh prefix each time.
   */
  idPrefix?: string;
  /** World point of the import's top-left (masthead / first chapter). */
  origin?: { x: number; y: number };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function artifactPayload(art: ImportArtifactSpec): ArtifactPayload | null {
  switch (art.kind) {
    case "table": {
      const columns = art.columns.map((label, i) => ({ key: `c${i}`, label }));
      const rows = art.rows.map((cells) =>
        Object.fromEntries(columns.map((col, i) => [col.key, cells[i] ?? ""])),
      );
      return {
        type: "table",
        title: art.title,
        data: normalizeTableArtifactData({ columns, rows }),
      };
    }
    case "stat":
      return statPayload(art.title, {
        value: art.value,
        label: art.label,
        ...(art.source ? { source: art.source } : {}),
      });
    case "quote":
      return quotePayload(art.title, {
        text: art.text,
        speaker: art.speaker,
        ...(art.context ? { context: art.context } : {}),
      });
    case "steps":
      return mechanismPayload(art.title, {
        steps: art.steps.map((step, i) => ({
          id: `s${i + 1}`,
          label: step.label,
          ...(step.note ? { note: step.note } : {}),
        })),
        // Empty edges: the normalizer chains the steps in order.
        edges: [],
      });
    case "term":
      return definitionPayload(art.title, {
        term: art.term,
        gloss: art.definition,
      });
    case "debate":
      return claimPayload(art.title, {
        topic: art.topic,
        proposition: art.forSide,
        counter: art.againstSide,
      });
    case "link":
      return null; // Spawned as a website artifact instead.
  }
}

function todoPayload(
  title: string,
  items: string[],
  checked: boolean,
): ArtifactPayload {
  return {
    type: "todo",
    title,
    data: normalizeTodoArtifactData({
      items: items.map((label, i) => ({ id: `t${i + 1}`, label, checked })),
    }),
  };
}

export function buildConversationImportCanvasSection(
  spec: ConversationImportSpec,
  options: ConversationImportBuildOptions = {},
): TranscriptImportCanvasSection {
  const ID = options.idPrefix ?? "ci";
  const MAIN_THREAD = `${ID}-thread-main`;
  const cards: Record<string, Card> = {};
  const cardOrder: string[] = [];
  const connections: Connection[] = [];
  const sessionArtifacts: Record<string, SessionArtifact> = {};
  const canvasArtifactNodes: Record<string, CanvasArtifactNode> = {};
  const canvasArtifactOrder: string[] = [];
  const threads: Record<string, Thread> = {};
  const threadOrder: string[] = [];
  const threadGists: Record<string, ThreadGist> = {};

  const addThread = (id: string, gist: string, turns: number) => {
    threads[id] = thread(id, threadOrder.length);
    threadOrder.push(id);
    if (gist) threadGists[id] = threadGist(clip(gist, GIST_MAX), turns);
  };

  addThread(
    MAIN_THREAD,
    spec.summary || spec.chapters.map((c) => c.title).join("; "),
    spec.chapters.length,
  );

  const spawn = (nodeId: string, payload: ArtifactPayload, cardId: string) =>
    spawnPayload(
      nodeId,
      payload,
      cardId,
      sessionArtifacts,
      canvasArtifactNodes,
      canvasArtifactOrder,
    );

  const mainCardIds: string[] = [];

  spec.chapters.forEach((chapter, ci) => {
    const headId = `${ID}-c-${ci + 1}`;
    cards[headId] = convCard(headId, MAIN_THREAD, chapter.title, chapter.summary);
    cardOrder.push(headId);
    mainCardIds.push(headId);

    if (chapter.followUps.length > 0) {
      const threadId = `${ID}-thread-${ci + 1}`;
      addThread(
        threadId,
        chapter.followUps.map((f) => `${f.title} — ${f.summary}`).join(" "),
        chapter.followUps.length,
      );
      chapter.followUps.forEach((followUp, fi) => {
        const id = `${ID}-c-${ci + 1}-f${fi + 1}`;
        cards[id] = convCard(id, threadId, followUp.title, followUp.summary, headId);
        cardOrder.push(id);
        connections.push(
          fi === 0
            ? conn(headId, id, "bottom", "top")
            : conn(`${ID}-c-${ci + 1}-f${fi}`, id, "right", "left"),
        );
      });
    }

    chapter.artifacts.forEach((art, ai) => {
      const nodeId = `${ID}-art-${ci + 1}-${ai + 1}`;
      if (art.kind === "link") {
        spawnWebsite(
          `${ID}-${ci + 1}-${ai + 1}`,
          art.url,
          art.title,
          headId,
          sessionArtifacts,
          canvasArtifactNodes,
          canvasArtifactOrder,
        );
        return;
      }
      const payload = artifactPayload(art);
      if (payload) spawn(nodeId, payload, headId);
    });
  });

  // Where the conversation stopped — the natural place to keep researching.
  if (spec.openThreads.length > 0 || spec.decisions.length > 0) {
    const id = `${ID}-c-next`;
    const parts: string[] = [];
    if (spec.decisions.length > 0) {
      parts.push(`Decided: ${spec.decisions.join("; ")}.`);
    }
    if (spec.openThreads.length > 0) {
      parts.push(`Still open: ${spec.openThreads.join("; ")}.`);
    }
    cards[id] = convCard(id, MAIN_THREAD, "Where we left off", parts.join(" "));
    cardOrder.push(id);
    mainCardIds.push(id);
    if (spec.openThreads.length > 0) {
      spawn(`${ID}-art-open`, todoPayload("Open threads", spec.openThreads, false), id);
    }
    if (spec.decisions.length > 0) {
      spawn(`${ID}-art-decisions`, todoPayload("Decisions", spec.decisions, true), id);
    }
  }

  const mastheadNodeIds: string[] = [];
  if (spec.sources.length > 0) {
    const nodeId = `${ID}-art-sources`;
    spawn(
      nodeId,
      linkGroupPayload("Sources", {
        sections: [
          {
            label: "Cited in the conversation",
            links: spec.sources.map((s) => ({ label: s.title, url: s.url })),
          },
        ],
      }),
      mainCardIds[0]!,
    );
    mastheadNodeIds.push(nodeId);
  }

  const layout = layoutChapters({
    mainCardIds,
    mastheadNodeIds,
    cards,
    cardOrder,
    connections,
    canvasArtifactNodes,
    canvasArtifactOrder,
    sessionArtifacts,
    idPrefix: ID,
    origin: options.origin,
  });

  return {
    cards,
    cardOrder,
    connections: layout.connections,
    threads,
    threadOrder,
    threadGists,
    groups: layout.groups,
    sessionArtifacts,
    canvasArtifactNodes,
    canvasArtifactOrder,
    contentCenter: layout.contentCenter,
  };
}
