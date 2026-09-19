import { raiseGuestWallIfLimited } from "@/lib/billing/guestWall";
import {
  buildGroupTranscript,
  transcriptHasContent,
} from "@/lib/buildGroupTranscript";
import {
  buildFlowstateGroupTranscript,
  groupHasNewSummaryContent,
} from "@/lib/groupSummaryStaleness";
import type { BranchGroup, ClaudeModel } from "@/lib/store";
import { useCanvasStore } from "@/lib/store";

export async function summarizeGroup(
  groupId: string,
  model: ClaudeModel,
): Promise<{ ok: true } | { ok: false; error: string | null }> {
  const state = useCanvasStore.getState();
  const group = state.groups[groupId];
  if (!group) return { ok: false, error: "Group not found" };

  const transcript = buildGroupTranscript(state, group);
  if (!transcriptHasContent(transcript)) {
    return {
      ok: false,
      error: "No completed conversations to summarize in this group.",
    };
  }

  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, transcript }),
  });

  if (!res.ok) {
    // A spent guest allowance raises the sign-in modal instead of surfacing an
    // error. A null error means "stop, but say nothing" — both callers feed it
    // straight into their error state, so null correctly clears it.
    if (await raiseGuestWallIfLimited(res)) {
      return { ok: false, error: null };
    }
    let message = `Summarize failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    return { ok: false, error: message };
  }

  const data = await res.json();
  if (!data.markdown || typeof data.markdown !== "string") {
    return { ok: false, error: "Invalid response from summarize API" };
  }

  useCanvasStore.getState().setGroupSummary(groupId, data.markdown);
  return { ok: true };
}

export async function refreshGroupSummary(
  groupId: string,
  model: ClaudeModel,
): Promise<{ ok: true } | { ok: false; error: string | null }> {
  const state = useCanvasStore.getState();
  const group = state.groups[groupId];
  if (!group?.summaryMarkdown) {
    return { ok: false, error: "Group has no summary to refresh." };
  }

  if (!groupHasNewSummaryContent(state, group)) {
    return { ok: false, error: "No new conversations to add to this summary." };
  }

  const transcript = buildFlowstateGroupTranscript(state, group);
  if (!transcriptHasContent(transcript)) {
    return { ok: false, error: "No new conversations to add to this summary." };
  }

  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      mode: "refresh",
      existingMarkdown: group.summaryMarkdown,
      transcript,
    }),
  });

  if (!res.ok) {
    // A spent guest allowance raises the sign-in modal instead of surfacing an
    // error. A null error means "stop, but say nothing" — both callers feed it
    // straight into their error state, so null correctly clears it.
    if (await raiseGuestWallIfLimited(res)) {
      return { ok: false, error: null };
    }
    let message = `Summarize failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    return { ok: false, error: message };
  }

  const data = await res.json();
  if (!data.markdown || typeof data.markdown !== "string") {
    return { ok: false, error: "Invalid response from summarize API" };
  }

  useCanvasStore.getState().setGroupSummary(groupId, data.markdown);
  return { ok: true };
}

export function downloadGroupMarkdown(group: BranchGroup): void {
  const markdown = group.summaryMarkdown;
  if (!markdown) return;

  const safeLabel = group.label
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "group";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `flowstate-${safeLabel}-${date}.md`;

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getGroupMarkdown(groupId: string): string | null {
  return useCanvasStore.getState().groups[groupId]?.summaryMarkdown ?? null;
}
