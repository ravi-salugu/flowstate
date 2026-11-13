"use client";

import type { ReactNode } from "react";
import {
  Camera,
  Columns3,
  Copy,
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  Image,
  LayoutGrid,
  Lightbulb,
  MessageCircleQuestionMark,
  MessageSquare,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Settings,
  Share2,
  Text,
  Trash2,
  Undo2,
  User,
  Box,
} from "lucide-react";
import { Icon } from "@/components/ui/Icon";

/**
 * Shared menu/chrome iconography — lucide-react rendered through the Icon
 * primitive. Export names are stable; a few brand-specific marks (branch
 * fork, GIF) remain hand-drawn below with matching stroke weight.
 */

const DEFAULT_CLASS = "h-4 w-4";

export function LayoutGridIcon() {
  return <Icon icon={LayoutGrid} className={DEFAULT_CLASS} />;
}

export function PencilIcon() {
  return <Icon icon={Pencil} className={DEFAULT_CLASS} />;
}

export function UndoIcon() {
  return <Icon icon={Undo2} className={DEFAULT_CLASS} />;
}

export function BranchForkIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none">
      <path
        d="M8 3v4M8 7c-2.2 0-3.5 1.2-3.5 3.5V13"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M8 7c2.2 0 3.5 1.2 3.5 3.5V13"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="8" cy="3" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function QuestionIcon() {
  return <Icon icon={MessageCircleQuestionMark} className={DEFAULT_CLASS} />;
}

export function ArtefactIcon() {
  return <Icon icon={LayoutGrid} className={DEFAULT_CLASS} />;
}

export function ChatBubbleIcon() {
  return <Icon icon={MessageSquare} className={DEFAULT_CLASS} />;
}

export function FocusViewIcon() {
  return <Icon icon={Columns3} className={DEFAULT_CLASS} />;
}

export function EyeIcon() {
  return <Icon icon={Eye} className={DEFAULT_CLASS} />;
}

export function EyeOffIcon() {
  return <Icon icon={EyeOff} className={DEFAULT_CLASS} />;
}

export function TypeIcon() {
  return <Icon icon={Text} className={DEFAULT_CLASS} />;
}

/** Text box with corner handles — the toolbar's standalone Text tool. */
export function TextBoxIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.75" y="2.75" width="4" height="4" rx="0.5" />
      <rect x="17.25" y="2.75" width="4" height="4" rx="0.5" />
      <rect x="2.75" y="17.25" width="4" height="4" rx="0.5" />
      <rect x="17.25" y="17.25" width="4" height="4" rx="0.5" />
      <path d="M6.75 4.75h10.5M6.75 19.25h10.5M4.75 6.75v10.5M19.25 6.75v10.5" />
      <path d="M9 9h6M12 9v6.5" />
    </svg>
  );
}

export function PlusIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return <Icon icon={Plus} className={className} />;
}

export function ImageIcon() {
  return <Icon icon={Image} className={DEFAULT_CLASS} />;
}

export function PaperclipIcon() {
  return <Icon icon={Paperclip} className={DEFAULT_CLASS} />;
}

export function Model3DIcon() {
  return <Icon icon={Box} className={DEFAULT_CLASS} />;
}

export function ScreenshotIcon() {
  return <Icon icon={Camera} className={DEFAULT_CLASS} />;
}

export function GifIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none">
      <rect
        x="2"
        y="4"
        width="12"
        height="8"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M4.5 7.25h1.1v1.5M6.2 7.25v1.5M6.2 7.25h.85a.55.55 0 0 1 0 1.1H6.2M8.4 8.75V7.25M8.4 7.25h.9a.55.55 0 0 1 0 1.1H8.4M10.5 8.75c0-.55-.45-1-1-1s-1 .45-1 1 .45 1 1 1 1-.45 1-1Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocumentIcon() {
  return <Icon icon={FileText} className={DEFAULT_CLASS} />;
}

export function ChatImportIcon() {
  return <Icon icon={MessagesSquare} className={DEFAULT_CLASS} />;
}

export function CodeFileIcon() {
  return <Icon icon={FileCode2} className={DEFAULT_CLASS} />;
}

export function ShareIcon() {
  return <Icon icon={Share2} className={DEFAULT_CLASS} />;
}

export function GearIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return <Icon icon={Settings} className={className} />;
}

export function SettingsIcon() {
  return <Icon icon={Settings} className={DEFAULT_CLASS} />;
}

export function DuplicateIcon() {
  return <Icon icon={CopyPlus} className={DEFAULT_CLASS} />;
}

export function DownloadIcon() {
  return <Icon icon={Download} className={DEFAULT_CLASS} />;
}

export function CopyIcon() {
  return <Icon icon={Copy} className={DEFAULT_CLASS} />;
}

export function PersonIcon() {
  return <Icon icon={User} className={DEFAULT_CLASS} />;
}

export function LightbulbIcon() {
  return <Icon icon={Lightbulb} className={DEFAULT_CLASS} />;
}

export function TrashIcon() {
  return <Icon icon={Trash2} className={DEFAULT_CLASS} />;
}

const menuItemClass =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-canvas-body-sm text-canvas-ink transition-colors hover:bg-canvas-bg disabled:cursor-not-allowed disabled:opacity-40";

interface ContextMenuItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}

export function ContextMenuItem({
  icon,
  label,
  onClick,
  disabled,
  variant = "default",
}: ContextMenuItemProps) {
  const danger = variant === "danger";

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        menuItemClass,
        danger ? "text-canvas-danger hover:bg-canvas-dangerSoft" : "",
      ].join(" ")}
    >
      <span className={danger ? "text-canvas-danger" : "text-canvas-muted"}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export { menuItemClass };
