import type {
  ChatPayload,
  PayloadContextChunk,
} from "@/lib/types/component";
import {
  expectObject,
  expectString,
  type KindSpec,
} from "@/lib/components/KindRegistry";

export const chatKindSpec: KindSpec<"chat"> = {
  kind: "chat",
  defaultSize: { w: 420, h: 240 },
  contextMimeTypes: ["text/markdown"],

  validate(raw: unknown): ChatPayload {
    const obj = expectObject(raw, "chat");
    return {
      kind: "chat",
      question: expectString(obj.question, "chat.question"),
      answer: expectString(obj.answer, "chat.answer"),
    };
  },

  serializeForContext(payload: ChatPayload): PayloadContextChunk[] {
    // Q + A together so the downstream model sees prior intent and prior answer.
    return [
      {
        mimeType: "text/markdown",
        text: `**Q:** ${payload.question}\n\n**A:** ${payload.answer}`,
        caption: "Prior chat turn",
      },
    ];
  },
};
