"use client";

import { useRef, useState } from "react";
import {
  ArtefactIcon,
  PencilIcon,
  PlusIcon,
  QuestionIcon,
  TextBoxIcon,
} from "@/components/MenuIcons";
import { CanvasAddMenu } from "@/components/CanvasAddMenu";
import { CanvasArtifactMenu } from "@/components/CanvasArtifactMenu";
import { CanvasGifPicker } from "@/components/CanvasGifPicker";
import { CanvasPencilPopover } from "@/components/CanvasPencilPopover";
import { useCanEditCanvas, useAuth } from "@/components/AuthProvider";
import { uploadAssetFiles, type AssetUploadError, DOCUMENT_FILE_ACCEPT, CODE_FILE_ACCEPT, isDocumentAssetKind } from "@/lib/attachments";
import { showUploadErrorsToast } from "@/lib/uploadErrorToast";
import { useClientMounted } from "@/hooks/useClientMounted";
import { useCanvasStore } from "@/lib/store";
import { showAppErrorToast, showAppToast } from "@/lib/appToastStore";

import { iconToggleBtn, toolbarBtn } from "@/components/toolbarButtonClasses";

export function CanvasBottomToolbar() {
  const mounted = useClientMounted();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const artefactBtnRef = useRef<HTMLButtonElement>(null);
  const pencilBtnRef = useRef<HTMLButtonElement>(null);
  const toolbarShellRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const codeFileInputRef = useRef<HTMLInputElement>(null);
  const model3dInputRef = useRef<HTMLInputElement>(null);
  const chatImportInputRef = useRef<HTMLInputElement>(null);
  const [importingChat, setImportingChat] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [artifactMenuOpen, setArtifactMenuOpen] = useState(false);
  const [pencilOpen, setPencilOpen] = useState(false);
  const canEdit = useCanEditCanvas();
  const { user, activeCanvasId } = useAuth();
  const viewMode = useCanvasStore((s) => s.viewMode);
  const requestCanvasPlacement = useCanvasStore((s) => s.requestCanvasPlacement);
  const requestArtifactPlacement = useCanvasStore((s) => s.requestArtifactPlacement);
  const activeCanvasPlacement = useCanvasStore((s) => s.activeCanvasPlacement);
  const setGifPickerOpen = useCanvasStore((s) => s.setGifPickerOpen);
  const gifPickerOpen = useCanvasStore((s) => s.gifPickerOpen);
  const addCanvasAsset = useCanvasStore((s) => s.addCanvasAsset);
  const requestImagePlacement = useCanvasStore((s) => s.requestImagePlacement);
  const createThreeDArtifactFromFile = useCanvasStore(
    (s) => s.createThreeDArtifactFromFile,
  );
  const pencilToolActive = useCanvasStore((s) => s.pencilToolActive);
  const pencilColor = useCanvasStore((s) => s.pencilColor);
  const setPencilToolActive = useCanvasStore((s) => s.setPencilToolActive);
  const setPencilColor = useCanvasStore((s) => s.setPencilColor);

  // Every tool here acts on the canvas surface, so other views drop the bar.
  // The view switch, sharing, hide-chats and canvas settings live in the
  // top-right unit (CanvasTopRightToolbar).
  const canvasTools = viewMode === "canvas";

  const closeSubpanels = () => {
    setAddMenuOpen(false);
    setArtifactMenuOpen(false);
    setGifPickerOpen(false);
    setPencilOpen(false);
  };

  const deactivatePencil = () => {
    setPencilToolActive(false);
    setPencilOpen(false);
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!files?.length || !canEdit) return;
    const result = await uploadAssetFiles(
      files,
      user && activeCanvasId ? { userId: user.id, canvasId: activeCanvasId } : null,
    );
    const imageAsset = result.assets.find((asset) => asset.kind === "image");
    for (const asset of result.assets) addCanvasAsset(asset);
    if (imageAsset) requestImagePlacement(imageAsset.id);
    if (result.errors.length > 0) {
      showUploadErrorsToast(result.errors);
    }
  };

  const handleDocumentFiles = async (files: FileList | null) => {
    if (!files?.length || !canEdit) return;
    const result = await uploadAssetFiles(
      files,
      user && activeCanvasId ? { userId: user.id, canvasId: activeCanvasId } : null,
    );
    const documentAsset = result.assets.find((asset) =>
      isDocumentAssetKind(asset.kind),
    );
    for (const asset of result.assets) addCanvasAsset(asset);
    if (documentAsset) requestImagePlacement(documentAsset.id);
    if (result.errors.length > 0) {
      showUploadErrorsToast(result.errors);
    }
  };

  const handleCodeFiles = async (files: FileList | null) => {
    if (!files?.length || !canEdit) return;
    const result = await uploadAssetFiles(
      files,
      user && activeCanvasId ? { userId: user.id, canvasId: activeCanvasId } : null,
    );
    const codeAsset = result.assets.find((asset) => asset.kind === "code");
    for (const asset of result.assets) addCanvasAsset(asset);
    if (codeAsset) requestImagePlacement(codeAsset.id);
    if (result.errors.length > 0) {
      showUploadErrorsToast(result.errors);
    }
  };

  // "Continue on Flowstate": a consolidated chat or transcript becomes its own
  // section of this canvas, to the right of whatever is already here.
  const handleChatImportFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !canEdit || importingChat) return;
    setImportingChat(true);
    showAppToast(`Importing ${file.name}…`);
    try {
      // Loaded on demand: the chapter engine stays out of the toolbar bundle.
      const { requestConversationImport, importIntoActiveCanvas } = await import(
        "@/lib/conversationImport/client"
      );
      const result = await requestConversationImport(file);
      if (!result.ok) {
        if (result.error) showAppErrorToast(result.error);
        return;
      }
      if (importIntoActiveCanvas(result.spec)) {
        showAppToast(
          result.truncated
            ? `Imported “${result.spec.title}” — the file was long, so the end may be missing`
            : `Imported “${result.spec.title}”`,
        );
      }
    } finally {
      setImportingChat(false);
    }
  };

  const handle3DModelFiles = async (files: FileList | null) => {
    if (!files?.length || !canEdit) return;
    const uploadContext =
      user && activeCanvasId
        ? { userId: user.id, canvasId: activeCanvasId }
        : null;
    const errors: AssetUploadError[] = [];
    let created = false;

    for (let index = 0; index < files.length; index++) {
      const result = await createThreeDArtifactFromFile(files[index]!, {
        uploadContext,
        index,
        recordUndo: index === 0 && !created,
      });
      if ("error" in result) {
        errors.push(result.error);
      } else {
        created = true;
      }
    }

    if (errors.length > 0) {
      showUploadErrorsToast(errors);
    }
  };

  const artefactPlacementActive = activeCanvasPlacement === "artifact";

  if (!canvasTools) return null;

  if (!mounted) {
    return (
      <div
        className="pointer-events-none absolute bottom-5 left-1/2 z-50 h-[52px] w-[min(100%,420px)] -translate-x-1/2 rounded-canvas-wrap-13 border border-transparent"
        aria-hidden
      />
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-50 -translate-x-1/2">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          void handleImageFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept={DOCUMENT_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleDocumentFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={codeFileInputRef}
        type="file"
        accept={CODE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleCodeFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={model3dInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={(e) => {
          void handle3DModelFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={chatImportInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        data-chat-import-input
        onChange={(e) => {
          void handleChatImportFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div ref={toolbarShellRef} className="relative">
        <CanvasAddMenu
          open={addMenuOpen}
          onClose={() => setAddMenuOpen(false)}
          anchorRef={addBtnRef}
          containerRef={toolbarShellRef}
          disabled={!canEdit}
          onAddImage={() => imageInputRef.current?.click()}
          onAdd3DModel={() => model3dInputRef.current?.click()}
          onAddDocument={() => documentInputRef.current?.click()}
          onAddCodeFile={() => codeFileInputRef.current?.click()}
          onImportChat={() => chatImportInputRef.current?.click()}
          onAddGifs={() => {
            setAddMenuOpen(false);
            setGifPickerOpen(true);
          }}
        />
        <CanvasArtifactMenu
          open={artifactMenuOpen}
          onClose={() => setArtifactMenuOpen(false)}
          anchorRef={artefactBtnRef}
          containerRef={toolbarShellRef}
          disabled={!canEdit}
          onPick={(pick) => {
            closeSubpanels();
            requestArtifactPlacement(pick);
          }}
        />
        <CanvasGifPicker
          anchorRef={addBtnRef}
          containerRef={toolbarShellRef}
        />
        <CanvasPencilPopover
          open={pencilOpen}
          onClose={() => setPencilOpen(false)}
          anchorRef={pencilBtnRef}
          containerRef={toolbarShellRef}
          active={pencilToolActive}
          color={pencilColor}
          disabled={!canEdit}
          onToggle={() => {
            if (pencilToolActive) {
              setPencilToolActive(false);
              setPencilOpen(false);
            } else {
              setPencilToolActive(true);
            }
          }}
          onColorChange={setPencilColor}
        />
        <div
          className="floating-chrome-padding flex items-center gap-1 rounded-canvas-wrap-13 border border-canvas-border bg-canvas-card shadow-card"
          role="toolbar"
          aria-label="Canvas tools"
        >
          <button
            type="button"
            disabled={!canEdit}
            className={`${toolbarBtn} bg-canvas-accent text-canvas-onAccent ${
              activeCanvasPlacement === "question"
                ? "ring-2 ring-canvas-accent ring-offset-2 ring-offset-canvas-card"
                : ""
            }`}
            aria-pressed={activeCanvasPlacement === "question"}
            onClick={() => {
              closeSubpanels();
              deactivatePencil();
              requestCanvasPlacement("question");
            }}
          >
            <QuestionIcon />
            Drop a question
          </button>
          <button
            ref={artefactBtnRef}
            type="button"
            data-coach-target="artefact-btn"
            disabled={!canEdit}
            className={`${toolbarBtn} ${
              artifactMenuOpen || artefactPlacementActive
                ? "bg-canvas-accentSoft text-canvas-accent"
                : ""
            }`}
            aria-pressed={artifactMenuOpen || artefactPlacementActive}
            aria-expanded={artifactMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              deactivatePencil();
              setGifPickerOpen(false);
              setArtifactMenuOpen((v) => !v);
            }}
          >
            <span className="text-canvas-muted">
              <ArtefactIcon />
            </span>
            Add artefact
          </button>
          <button
            ref={addBtnRef}
            type="button"
            data-coach-target="add-btn"
            disabled={!canEdit}
            className={`${toolbarBtn} ${
              addMenuOpen || gifPickerOpen
                ? "bg-canvas-accentSoft text-canvas-accent"
                : ""
            }`}
            aria-expanded={addMenuOpen || gifPickerOpen}
            aria-haspopup="menu"
            onClick={() => {
              deactivatePencil();
              setGifPickerOpen(false);
              setArtifactMenuOpen(false);
              setAddMenuOpen((v) => !v);
            }}
          >
            <span className="text-canvas-muted">
              <PlusIcon />
            </span>
            Add
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-canvas-border" aria-hidden />

          <button
            ref={pencilBtnRef}
            type="button"
            disabled={!canEdit}
            className={`${iconToggleBtn} ${
              pencilOpen || pencilToolActive
                ? "bg-canvas-accentSoft text-canvas-accent"
                : "text-canvas-muted hover:text-canvas-ink"
            }`}
            aria-label="Pencil tool"
            aria-expanded={pencilOpen}
            aria-pressed={pencilToolActive}
            aria-haspopup="dialog"
            onClick={() => {
              if (pencilToolActive) {
                setPencilOpen((v) => !v);
                return;
              }
              setAddMenuOpen(false);
              setGifPickerOpen(false);
              setArtifactMenuOpen(false);
              setPencilToolActive(true);
              setPencilOpen(true);
            }}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            disabled={!canEdit}
            className={`${iconToggleBtn} ${
              activeCanvasPlacement === "text"
                ? "bg-canvas-accentSoft text-canvas-accent"
                : "text-canvas-muted hover:text-canvas-ink"
            }`}
            aria-label="Text tool"
            aria-pressed={activeCanvasPlacement === "text"}
            onClick={() => {
              closeSubpanels();
              deactivatePencil();
              requestCanvasPlacement("text");
            }}
          >
            <TextBoxIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
