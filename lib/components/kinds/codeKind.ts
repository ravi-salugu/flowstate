import type {
  CodeFile,
  CodePayload,
  PayloadContextChunk,
} from "@/lib/types/component";
import {
  expectArray,
  expectObject,
  expectString,
  type KindSpec,
} from "@/lib/components/KindRegistry";

function validateFile(raw: unknown, i: number): CodeFile {
  const obj = expectObject(raw, `code.files[${i}]`);
  return {
    path: expectString(obj.path, `code.files[${i}].path`),
    language: expectString(obj.language, `code.files[${i}].language`),
    content: expectString(obj.content, `code.files[${i}].content`),
  };
}

export const codeKindSpec: KindSpec<"code"> = {
  kind: "code",
  defaultSize: { w: 620, h: 460 },
  contextMimeTypes: ["text/markdown"],

  validate(raw: unknown): CodePayload {
    const obj = expectObject(raw, "code");
    return {
      kind: "code",
      files: expectArray(obj.files, "code.files", validateFile),
    };
  },

  serializeForContext(payload: CodePayload): PayloadContextChunk[] {
    // Each file gets its own fenced code block with a path header.
    return payload.files.map((file) => ({
      mimeType: "text/markdown",
      text:
        `**${file.path}**\n\n` +
        "```" +
        file.language +
        "\n" +
        file.content +
        "\n```",
      caption: `Code: ${file.path}`,
    }));
  },
};
