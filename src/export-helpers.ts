import type { MessageSnapshot, ExportPayload, ExportMeta, ExportOptions, LinkContext } from "./types.js";
import { filenameSafe } from "./utilities.js";
import { renderMarkdown } from "./markdown-renderer.js";
import { renderHtmlDocument } from "./html-renderer.js";
import { getConversationTitle } from "./conversation.js";
import { formatLocalDateTime } from "./utilities.js";
import { resolveImageAssets } from "./image-assets.js";
import { buildZip } from "./zip-writer.js";

export function getExportMessageCountLabel(count: number, scope: string): string {
  if (scope === "full-chat") {
    return `Full chat history messages: ${count}`;
  }

  return `Selected messages: ${count}`;
}

export function getExportMessageSummary(count: number, scope: string): string {
  if (scope === "full-chat") {
    return `${count} message${count === 1 ? "" : "s"} captured from the full chat history.`;
  }

  return `${count} message${count === 1 ? "" : "s"} selected.`;
}

export function getExportScopeSuffix(scope: string): string {
  return scope === "full-chat" ? "-full-chat" : "";
}

export function triggerDownloadBlob(filename: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

export function triggerDownload(filename: string, mimeType: string, content: string): void {
  triggerDownloadBlob(filename, new Blob([content], { type: mimeType }));
}

export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (clipboardError) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw clipboardError;
    }

    return true;
  }
}

/**
 * Clipboard copies never bundle a zip of images alongside them, so any
 * embedded image markdown links (which only resolve inside an export zip)
 * are converted back to the plain "[Image omitted]" placeholder.
 */
export function stripEmbeddedImageLinks(markdown: string): string {
  return markdown.replace(/!\[[^\]]*\]\(images\/image_[^)]+\.png\)/g, "[Image omitted]");
}

export function createExportPayload(
  format: string,
  messages: MessageSnapshot[],
  meta: ExportMeta = {},
  options?: ExportOptions,
  linkContext?: LinkContext | null
): ExportPayload {
  const scope = meta.scope || "selection";
  const title = meta.title || getConversationTitle();
  const sourceUrl = meta.sourceUrl || location.href;
  const exportedAt = formatLocalDateTime(new Date());
  const titlePart = filenameSafe(title) || "teams-conversation";
  const timestampPart = new Date().toISOString().replace(/[:.]/g, "-");
  const scopeSuffix = getExportScopeSuffix(scope);

  const renderMeta = { title, sourceUrl, exportedAt, scope, options, linkContext };

  if (format === "html") {
    return {
      format,
      filename: `${titlePart}${scopeSuffix}-${timestampPart}.html`,
      content: renderHtmlDocument(messages, renderMeta),
      count: messages.length,
      scope
    };
  }

  return {
    format: "md",
    filename: `${titlePart}${scopeSuffix}-${timestampPart}.md`,
    content: renderMarkdown(messages, renderMeta),
    count: messages.length,
    scope
  };
}

function collectImageIds(messages: MessageSnapshot[]): Set<string> {
  const imageIds = new Set<string>();
  messages.forEach((message) => {
    message.images?.forEach((id) => imageIds.add(id));
  });
  return imageIds;
}

/**
 * Commits an export payload to a download. When the source messages reference
 * any captured images (selection-mode export only — see image-assets.ts),
 * this bundles the html/markdown file together with an "images/" folder into
 * a single .zip instead of downloading the text file on its own.
 */
export async function commitExportPayload(
  payload: ExportPayload,
  messages: MessageSnapshot[],
  options: { download?: boolean } = {}
): Promise<ExportPayload> {
  if (options.download === false) {
    return payload;
  }

  const imageIds = collectImageIds(messages);

  if (imageIds.size === 0) {
    triggerDownload(
      payload.filename,
      payload.format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
      payload.content
    );
    return payload;
  }

  const resolvedAssets = await resolveImageAssets(imageIds);
  const zipEntries = [
    { name: payload.filename, data: new TextEncoder().encode(payload.content) },
    ...(await Promise.all(
      resolvedAssets.map(async (asset) => ({
        name: asset.localPath,
        data: new Uint8Array(await asset.blob.arrayBuffer())
      }))
    ))
  ];

  const zipFilename = payload.filename.replace(/\.(html|md)$/i, ".zip");
  triggerDownloadBlob(zipFilename, buildZip(zipEntries));

  return payload;
}
