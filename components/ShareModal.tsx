"use client";

import { useCallback, useState } from "react";
import { PublishPanel } from "@/components/published/PublishPanel";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import {
  MotionBackdrop,
  MotionOverlayModal,
} from "@/components/motion/MotionOverlay";
import { MotionFlowSize } from "@/components/motion/MotionFlowSize";
import {
  MAX_CANVAS_MEMBERS,
  isCanvasOwner,
} from "@/lib/collaborationPersistence";
import { showAppToast } from "@/lib/appToastStore";
import type { CanvasMember, CollaboratorRole } from "@/lib/collaborationTypes";
import { collaboratorStatusDotClass } from "@/lib/collaboratorActivity";
import { useCollaboratorActivity } from "@/hooks/useCollaboratorActivity";

export function ShareModal() {
  const {
    shareModalOpen,
    setShareModalOpen,
    activeCanvasRole,
    members,
    canvasInvites,
    shareLink,
    accessInfo,
    sendInvite,
    removeMember,
    changeMemberRole,
    toggleAllowViewerDuplicate,
    regenerateShareLink,
    transferOwnership,
    leaveCanvas,
    duplicateActiveCanvas,
    switchCanvas,
    activeCanvasId,
    user,
    onlineUserIds,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"people" | "publish">("people");

  const isOwner = isCanvasOwner(activeCanvasRole);
  const memberCount = members.length;
  const atCap = memberCount >= MAX_CANVAS_MEMBERS;

  const close = useCallback(() => {
    setShareModalOpen(false);
    setError(null);
    setEmail("");
  }, [setShareModalOpen]);

  const handleInvite = useCallback(async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendInvite(email, role);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setBusy(false);
    }
  }, [email, role, sendInvite]);

  const copyLink = useCallback(async () => {
    if (!shareLink?.token) return;
    const url = `${window.location.origin}/canvas/join/${shareLink.token}`;
    await navigator.clipboard.writeText(url);
    showAppToast("Link copied");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink?.token]);

  const handleDuplicate = useCallback(async () => {
    setBusy(true);
    try {
      const newId = await duplicateActiveCanvas();
      if (newId) {
        await switchCanvas(newId);
        close();
      }
    } finally {
      setBusy(false);
    }
  }, [close, duplicateActiveCanvas, switchCanvas]);

  const canDuplicate =
    activeCanvasRole === "editor" ||
    (activeCanvasRole === "viewer" && accessInfo?.allowViewerDuplicate);

  return (
    <>
      <MotionBackdrop
        isOpen={shareModalOpen}
        onClick={close}
        className="pointer-events-auto fixed inset-0 z-[100] bg-black/40"
      />
      {shareModalOpen && (
        <div className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center p-4">
          <MotionOverlayModal
            isOpen={shareModalOpen}
            className="pointer-events-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-canvas border border-canvas-border bg-canvas-card p-5 shadow-card"
          >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <MotionFlowSize>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="share-modal-title" className="text-canvas-heading font-semibold text-canvas-ink">
            Share canvas
          </h2>
          <CloseButton onClick={close} />
        </div>


        {isOwner && (
          <div className="mb-4 flex gap-1 rounded-canvas border border-canvas-border bg-canvas-bg p-1">
            {(["people", "publish"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-canvas px-3 py-1.5 text-canvas-body-sm font-medium transition ${
                  tab === t
                    ? "bg-canvas-card text-canvas-ink shadow-card"
                    : "text-canvas-muted hover:text-canvas-ink"
                }`}
              >
                {t === "people" ? "People" : "Publish to web"}
              </button>
            ))}
          </div>
        )}

        {isOwner && tab === "publish" ? (
          <PublishPanel canvasId={activeCanvasId} />
        ) : (
          <>
        {isOwner && (
          <>
            <div className="mb-4 space-y-2">
              <label className="text-canvas-body-sm font-medium text-canvas-muted">
                Invite by email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  disabled={atCap || busy}
                  className="min-w-0 flex-1 rounded-canvas border border-canvas-border bg-canvas-bg px-3 py-2 text-canvas-body-lg text-canvas-ink outline-none focus:border-canvas-accent disabled:opacity-50"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as CollaboratorRole)}
                  disabled={atCap || busy}
                  className="rounded-canvas border border-canvas-border bg-canvas-bg px-2 py-2 text-canvas-body text-canvas-ink"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </div>
              <Button
                variant="primary"
                disabled={atCap || !email.trim()}
                loading={busy}
                onClick={() => void handleInvite()}
                className="w-full"
              >
                {atCap ? "Collaborator limit reached (5)" : "Send invite"}
              </Button>
              {error && (
                <p className="text-canvas-body-sm text-canvas-danger">{error}</p>
              )}
            </div>

            {canvasInvites.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-canvas-body-sm font-medium text-canvas-muted">
                  Pending invites
                </h3>
                <ul className="space-y-1">
                  {canvasInvites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between rounded-canvas bg-canvas-bg px-3 py-2 text-canvas-body"
                    >
                      <span className="truncate text-canvas-ink">{inv.email}</span>
                      <span className="shrink-0 text-canvas-muted">{inv.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-4 space-y-2 border-t border-canvas-border pt-4">
              <h3 className="text-canvas-body-sm font-medium text-canvas-muted">
                View-only link
              </h3>
              <div className="flex gap-2">
                <Button
                  onClick={() => void copyLink()}
                  disabled={!shareLink?.token}
                  className="flex-1"
                >
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void regenerateShareLink()}
                  disabled={busy}
                >
                  Regenerate
                </Button>
              </div>
            </div>

            <label className="mb-4 flex cursor-pointer items-center gap-2 text-canvas-body text-canvas-ink">
              <input
                type="checkbox"
                checked={accessInfo?.allowViewerDuplicate ?? false}
                onChange={(e) => void toggleAllowViewerDuplicate(e.target.checked)}
                className="rounded border-canvas-border"
              />
              Allow viewers to duplicate this canvas
            </label>
          </>
        )}

        <div className="mb-4 border-t border-canvas-border pt-4">
          <h3 className="mb-2 text-canvas-body-sm font-medium text-canvas-muted">
            People with access ({memberCount}/{MAX_CANVAS_MEMBERS})
          </h3>
          <ul className="space-y-2">
            {members.map((member) => (
              <ShareMemberRow
                key={member.userId}
                member={member}
                isSelf={member.userId === user?.id}
                onlineUserIds={onlineUserIds}
                isOwner={isOwner}
                onChangeRole={(role) =>
                  void changeMemberRole(member.userId, role)
                }
                onRemove={() => void removeMember(member.userId)}
                onTransferOwnership={() =>
                  void transferOwnership(member.userId)
                }
              />
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 border-t border-canvas-border pt-4">
          {canDuplicate && (
            <Button disabled={busy} onClick={() => void handleDuplicate()}>
              Duplicate canvas
            </Button>
          )}
          {!isOwner && activeCanvasRole && (
            <Button
              tone="danger"
              disabled={busy}
              onClick={() => void leaveCanvas()}
            >
              Leave canvas
            </Button>
          )}
        </div>
          </>
        )}
        </MotionFlowSize>
      </div>
          </MotionOverlayModal>
        </div>
      )}
    </>
  );
}

function ShareMemberRow({
  member,
  isSelf,
  onlineUserIds,
  isOwner,
  onChangeRole,
  onRemove,
  onTransferOwnership,
}: {
  member: CanvasMember;
  isSelf: boolean;
  onlineUserIds: Set<string>;
  isOwner: boolean;
  onChangeRole: (role: CollaboratorRole) => void;
  onRemove: () => void;
  onTransferOwnership: () => void;
}) {
  const activity = useCollaboratorActivity(member.userId, onlineUserIds);
  const label = member.profile.displayName ?? "User";

  return (
    <li className="flex items-center gap-2 rounded-canvas bg-canvas-bg px-3 py-2">
      <div className="relative shrink-0">
        {member.profile.avatarUrl ? (
          <img
            src={member.profile.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-accent text-canvas-body font-semibold text-canvas-onAccent">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas-bg ${collaboratorStatusDotClass(activity.status)}`}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-canvas-body font-medium text-canvas-ink">
          {label}
          {isSelf ? " (you)" : ""}
        </p>
        <p className="truncate text-canvas-compact capitalize text-canvas-muted">
          {member.role}
          {!isSelf ? ` · ${activity.label}` : ""}
        </p>
      </div>
      {isOwner && member.role !== "owner" && (
        <div className="flex shrink-0 gap-1">
          <select
            value={member.role}
            onChange={(e) => onChangeRole(e.target.value as CollaboratorRole)}
            className="rounded border border-canvas-border bg-canvas-card px-1 py-0.5 text-canvas-compact"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <Button
            variant="ghost"
            tone="danger"
            size="sm"
            onClick={onRemove}
          >
            Remove
          </Button>
          {member.role === "editor" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onTransferOwnership}
              title="Transfer ownership"
            >
              Make owner
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
