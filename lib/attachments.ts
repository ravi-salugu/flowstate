import { ASSET_STORAGE_BUCKET } from "@/lib/storageBuckets";
import type { UploadedAttachment } from "@/lib/store";
import type { CanvasAsset, CanvasAssetKind } from "@/lib/store";
import {
  officeKindForExtension,
  officeKindForMime,
  OFFICE_FILE_ACCEPT,
  PRESENTATION_TYPES,
  SPREADSHEET_TYPES,
  WORD_TYPES,
} from "@/lib/officeAssetKinds";
import { createClient } from "@/lib/supabase/client";
import { isLocalReadOnlyClient } from "@/lib/supabase/localReadOnly";
import {
  AUDIO_ASSET_MAX_BYTES,
  isAudioFile,
} from "@/lib/audioArtifact";
import {
  isThreeDModelFile,
  THREE_D_MODEL_MAX_BYTES,
} from "@/lib/threeDArtifact";

export type UploadCategory = "images" | "documents" | "code";

export const UPLOAD_CATEGORY_LABELS: Record<UploadCategory, string> = {
  images: "Images",
  documents: "Documents",
  code: "Code",
};

export const DOCUMENT_FILE_ACCEPT =
  "application/pdf,text/plain,text/markdown,text/csv,application/json," +
  ".pdf,.txt,.md,.csv,.json," +
  OFFICE_FILE_ACCEPT;

export const CODE_FILE_ACCEPT =
  ".ts,.tsx,.js,.jsx,.py,.sql,.css,.html,.go,.rs,.java,.cpp,.c,.cs,.php,.rb,.sh,.yaml,.yml";

// Defined in a leaf module so server code can name the bucket without
// importing this file (which pulls in the browser Supabase client).
// Imported as well as re-exported: this file uses it internally.
export { ASSET_STORAGE_BUCKET };

/** Best-effort removal of uploaded assets for a deleted canvas. */
export async function deleteCanvasStorageAssets(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  canvasId: string,
): Promise<void> {
  const prefix = `${userId}/${canvasId}`;
  const { data: files, error } = await supabase.storage
    .from(ASSET_STORAGE_BUCKET)
    .list(prefix);

  if (error || !files?.length) return;

  const paths = files
    .filter((file) => file.name)
    .map((file) => `${prefix}/${file.name}`);

  if (paths.length === 0) return;

  await supabase.storage.from(ASSET_STORAGE_BUCKET).remove(paths);
}
export const ASSET_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
export const MAX_ASSET_BATCH_FILES = 20;
export const IMAGE_ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const CODE_ASSET_MAX_BYTES = 2 * 1024 * 1024;

/** MIME types the asset pipeline accepts for images. */
export const IMAGE_ASSET_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const DOCUMENT_EXTENSIONS = new Set(["pdf", "txt", "md", "csv", "json"]);

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "sql",
  "css",
  "html",
  "go",
  "rs",
  "java",
  "cpp",
  "c",
  "cs",
  "php",
  "rb",
  "sh",
  "yaml",
  "yml",
]);

export interface AssetUploadContext {
  canvasId: string;
  userId: string;
}

export type AssetUploadErrorCode =
  | "too-many-files"
  | "unsupported-type"
  | "file-too-large"
  | "image-read-failed"
  | "upload-failed"
  | "missing-context"
  | "read-only-local"
  | "audio-decode-failed";

export interface AssetUploadError {
  fileName?: string;
  code: AssetUploadErrorCode;
  message: string;
}

export interface AssetUploadBatchResult {
  assets: CanvasAsset[];
  errors: AssetUploadError[];
}

function extensionForName(name: string): string {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

function mimeFromExtension(ext: string): string {
  switch (ext) {
    case "md":
      return "text/markdown";
    case "html":
    case "htm":
      return "text/html";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "pdf":
      return "application/pdf";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xlsm":
      return "application/vnd.ms-excel.sheet.macroEnabled.12";
    case "ods":
      return "application/vnd.oasis.opendocument.spreadsheet";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "odt":
      return "application/vnd.oasis.opendocument.text";
    case "rtf":
      return "application/rtf";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "odp":
      return "application/vnd.oasis.opendocument.presentation";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "ogg":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    case "glb":
      return "model/gltf-binary";
    case "gltf":
      return "model/gltf+json";
    default:
      return "text/plain";
  }
}

export function assetKindForFile(file: File): CanvasAssetKind | null {
  const ext = extensionForName(file.name);
  const type = file.type || "";
  if (IMAGE_ASSET_MIME_TYPES.has(type)) return "image";
  const officeFromMime = type ? officeKindForMime(type) : null;
  if (officeFromMime) return officeFromMime;
  const officeFromExt = officeKindForExtension(ext);
  if (officeFromExt) return officeFromExt;
  if (DOCUMENT_TYPES.has(type) || DOCUMENT_EXTENSIONS.has(ext)) {
    return "document";
  }
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return null;
}

export function maxBytesForAssetKind(kind: CanvasAssetKind): number {
  if (kind === "code") return CODE_ASSET_MAX_BYTES;
  if (kind === "image") return IMAGE_ASSET_MAX_BYTES;
  return DOCUMENT_ASSET_MAX_BYTES;
}

export function isDocumentAssetKind(kind: CanvasAssetKind): boolean {
  return (
    kind === "document" ||
    kind === "spreadsheet" ||
    kind === "word" ||
    kind === "presentation"
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function uploadCategoryForMime(mime: string): UploadCategory | null {
  if (IMAGE_ASSET_MIME_TYPES.has(mime)) return "images";
  if (
    DOCUMENT_TYPES.has(mime) ||
    SPREADSHEET_TYPES.has(mime) ||
    WORD_TYPES.has(mime) ||
    PRESENTATION_TYPES.has(mime)
  ) {
    return "documents";
  }
  return null;
}

export function isAcceptedUploadMime(mime: string): boolean {
  return uploadCategoryForMime(mime) !== null;
}

export interface UploadCategoryGroup {
  category: UploadCategory;
  label: string;
  items: UploadedAttachment[];
}

export function groupUploadedAttachments(
  attachments: UploadedAttachment[],
): UploadCategoryGroup[] {
  const buckets: Record<UploadCategory, UploadedAttachment[]> = {
    images: [],
    documents: [],
    code: [],
  };

  for (const att of attachments) {
    const cat = uploadCategoryForMime(att.type);
    if (cat) buckets[cat].push(att);
  }

  return (["images", "documents", "code"] as const).map((category) => ({
    category,
    label: UPLOAD_CATEGORY_LABELS[category],
    items: buckets[category],
  }));
}

export function groupCanvasAssets(
  assets: CanvasAsset[],
): { category: UploadCategory; label: string; items: CanvasAsset[] }[] {
  const buckets: Record<UploadCategory, CanvasAsset[]> = {
    images: [],
    documents: [],
    code: [],
  };
  for (const asset of assets) {
    if (asset.kind === "image") buckets.images.push(asset);
    else if (asset.kind === "code") buckets.code.push(asset);
    else if (
      asset.kind === "document" ||
      asset.kind === "spreadsheet" ||
      asset.kind === "word" ||
      asset.kind === "presentation"
    ) {
      buckets.documents.push(asset);
    }
  }
  return (["images", "documents", "code"] as const).map((category) => ({
    category,
    label: UPLOAD_CATEGORY_LABELS[category],
    items: buckets[category].sort((a, b) => b.createdAt - a.createdAt),
  }));
}

function validateAssetFile(file: File): { kind: CanvasAssetKind } | AssetUploadError {
  const kind = assetKindForFile(file);
  if (!kind) {
    return {
      fileName: file.name,
      code: "unsupported-type",
      message: `${file.name} is not a supported image, document, spreadsheet, presentation, or code file.`,
    };
  }
  const maxBytes = maxBytesForAssetKind(kind);
  if (file.size > maxBytes) {
    return {
      fileName: file.name,
      code: "file-too-large",
      message: `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`,
    };
  }
  return { kind };
}

export function validateAudioFile(file: File): true | AssetUploadError {
  if (!isAudioFile(file)) {
    return {
      fileName: file.name,
      code: "unsupported-type",
      message: `${file.name} is not a supported audio file (MP3, WAV, M4A, AAC, OGG, or WebM audio).`,
    };
  }
  if (file.size > AUDIO_ASSET_MAX_BYTES) {
    return {
      fileName: file.name,
      code: "file-too-large",
      message: `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(AUDIO_ASSET_MAX_BYTES)}.`,
    };
  }
  return true;
}

export function validateThreeDModelFile(file: File): true | AssetUploadError {
  if (!isThreeDModelFile(file)) {
    return {
      fileName: file.name,
      code: "unsupported-type",
      message: `${file.name} is not a supported 3D model (GLB or GLTF).`,
    };
  }
  if (file.size > THREE_D_MODEL_MAX_BYTES) {
    return {
      fileName: file.name,
      code: "file-too-large",
      message: `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(THREE_D_MODEL_MAX_BYTES)}.`,
    };
  }
  return true;
}

export interface AudioUploadResult {
  fileName: string;
  mimeType: string;
  storagePath: string;
  publicUrl: string;
  sizeBytes: number;
}

export type ThreeDModelUploadResult = AudioUploadResult;

async function uploadBinaryAssetFile(
  file: File,
  context: AssetUploadContext | null,
  validate: (file: File) => true | AssetUploadError,
  missingContextMessage: string,
): Promise<{ upload: AudioUploadResult } | { error: AssetUploadError }> {
  if (!context?.canvasId || !context.userId) {
    return {
      error: {
        code: "missing-context",
        message: missingContextMessage,
      },
    };
  }

  if (isLocalReadOnlyClient()) {
    return {
      error: {
        code: "read-only-local",
        message:
          "File uploads are disabled in local session mode. Changes reset on reload.",
      },
    };
  }

  const validation = validate(file);
  if (validation !== true) {
    return { error: validation };
  }

  const supabase = createClient();
  const storagePath = `${context.userId}/${context.canvasId}/${safeStorageName(file.name)}`;
  const contentType =
    file.type || mimeFromExtension(extensionForName(file.name));

  const { error } = await supabase.storage
    .from(ASSET_STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType,
      upsert: false,
    });

  if (error) {
    return {
      error: {
        fileName: file.name,
        code: "upload-failed",
        message: `Could not upload ${file.name}: ${error.message}`,
      },
    };
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(ASSET_STORAGE_BUCKET)
    .createSignedUrl(storagePath, ASSET_SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    return {
      error: {
        fileName: file.name,
        code: "upload-failed",
        message: `Uploaded ${file.name}, but could not create a preview URL.`,
      },
    };
  }

  return {
    upload: {
      fileName: file.name,
      mimeType: contentType,
      storagePath,
      publicUrl: signed.signedUrl,
      sizeBytes: file.size,
    },
  };
}

export async function uploadAudioFile(
  file: File,
  context: AssetUploadContext | null,
): Promise<{ upload: AudioUploadResult } | { error: AssetUploadError }> {
  return uploadBinaryAssetFile(
    file,
    context,
    validateAudioFile,
    "Sign in and open a canvas before uploading audio.",
  );
}

export async function uploadThreeDModelFile(
  file: File,
  context: AssetUploadContext | null,
): Promise<{ upload: ThreeDModelUploadResult } | { error: AssetUploadError }> {
  return uploadBinaryAssetFile(
    file,
    context,
    validateThreeDModelFile,
    "Sign in and open a canvas before uploading 3D models.",
  );
}

function getImageDimensions(file: File): Promise<{
  width: number;
  height: number;
  aspectRatio: number;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        reject(new Error("Image has no readable dimensions"));
        return;
      }
      resolve({ width, height, aspectRatio: width / height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

export function safeStorageName(name: string): string {
  const ext = extensionForName(name);
  const stem = name
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${stem || "asset"}-${suffix}${ext ? `.${ext}` : ""}`;
}

export async function uploadAssetFiles(
  files: FileList | File[],
  context: AssetUploadContext | null,
): Promise<AssetUploadBatchResult> {
  const input = Array.from(files);
  const result: AssetUploadBatchResult = { assets: [], errors: [] };

  if (!context?.canvasId || !context.userId) {
    return {
      assets: [],
      errors: [
        {
          code: "missing-context",
          message: "Sign in and open a canvas before uploading assets.",
        },
      ],
    };
  }

  if (isLocalReadOnlyClient()) {
    return {
      assets: [],
      errors: [
        {
          code: "read-only-local",
          message:
            "File uploads are disabled in local session mode. Changes reset on reload.",
        },
      ],
    };
  }

  if (input.length > MAX_ASSET_BATCH_FILES) {
    result.errors.push({
      code: "too-many-files",
      message: `Drop ${MAX_ASSET_BATCH_FILES} files or fewer at a time.`,
    });
    return result;
  }

  const supabase = createClient();

  for (const file of input) {
    const validation = validateAssetFile(file);
    if ("code" in validation) {
      result.errors.push(validation);
      continue;
    }

    let dimensions:
      | { width: number; height: number; aspectRatio: number }
      | undefined;
    if (validation.kind === "image") {
      try {
        dimensions = await getImageDimensions(file);
      } catch {
        result.errors.push({
          fileName: file.name,
          code: "image-read-failed",
          message: `Could not read dimensions for ${file.name}.`,
        });
        continue;
      }
    }

    const storagePath = `${context.userId}/${context.canvasId}/${safeStorageName(file.name)}`;
    const contentType =
      file.type || mimeFromExtension(extensionForName(file.name));
    const { error } = await supabase.storage
      .from(ASSET_STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType,
        upsert: false,
      });

    if (error) {
      result.errors.push({
        fileName: file.name,
        code: "upload-failed",
        message: `Could not upload ${file.name}: ${error.message}`,
      });
      continue;
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(ASSET_STORAGE_BUCKET)
      .createSignedUrl(storagePath, ASSET_SIGNED_URL_TTL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      result.errors.push({
        fileName: file.name,
        code: "upload-failed",
        message: `Uploaded ${file.name}, but could not create a preview URL.`,
      });
      continue;
    }

    result.assets.push({
      id: `asset_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      canvasId: context.canvasId,
      ownerId: context.userId,
      name: file.name,
      mimeType: contentType,
      sizeBytes: file.size,
      storagePath,
      publicUrl: signed.signedUrl,
      kind: validation.kind,
      ...(dimensions ?? {}),
      createdAt: Date.now(),
    });
  }

  return result;
}

export async function fileToUploadedAttachment(
  file: File,
): Promise<UploadedAttachment | null> {
  const type = file.type || "application/octet-stream";
  if (!isAcceptedUploadMime(type)) return null;

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1]! : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return {
    id: `upload_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    type,
    data: base64,
    addedAt: Date.now(),
  };
}
