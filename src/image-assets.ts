/**
 * Image asset registry for the "selected messages" export path.
 *
 * Teams renders message images via `blob:` object URLs that the page itself
 * created (the client already fetched/decrypted the attachment) — see
 * `element.src="blob:https://teams.cloud.microsoft/<uuid>"` on the message's
 * `<img>`. Fetching that same-origin blob URL returns the image bytes
 * directly, no auth headers or cross-origin requests required.
 *
 * Registration happens the moment a message is scanned from the DOM (see
 * content-extraction.ts), so the fetch is kicked off while the blob URL is
 * still guaranteed to be alive — well before the row might unmount/scroll
 * out of the virtualized list and Teams potentially revokes it.
 */

interface RegisteredImageAsset {
  id: string;
  fileStem: string;
  localPath: string;
  blobPromise: Promise<Blob | null>;
}

export interface ResolvedImageAsset {
  id: string;
  localPath: string;
  blob: Blob;
}

const assetsBySrc = new Map<string, RegisteredImageAsset>();
let assetCounter = 0;

async function fetchImageBlob(src: string): Promise<Blob | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return null;
    }
    return await response.blob();
  } catch (error) {
    console.warn("Teams Selected Messages Export: failed to fetch an image for export.", src, error);
    return null;
  }
}

export function registerImageAsset(src: string): RegisteredImageAsset {
  const existing = assetsBySrc.get(src);
  if (existing) {
    return existing;
  }

  assetCounter += 1;
  const id = String(assetCounter);
  // Extension is fixed and cosmetic only — browsers/viewers sniff actual image
  // bytes rather than trusting the extension, so a uniform ".png" name keeps
  // the reference baked into html/markdown at scan time consistent with the
  // file we ultimately place in the zip, without needing to know the real
  // MIME type up front (only known once the async fetch resolves).
  // "image_N" (underscore) doubles as the markdown alt text, so the bare
  // filename can be copy-pasted straight out of the exported text when
  // saving a full-resolution copy of the image under a matching name.
  const fileStem = `image_${id}`;
  const localPath = `images/${fileStem}.png`;
  const asset: RegisteredImageAsset = { id, fileStem, localPath, blobPromise: fetchImageBlob(src) };
  assetsBySrc.set(src, asset);
  return asset;
}

export async function resolveImageAssets(ids: Iterable<string>): Promise<ResolvedImageAsset[]> {
  const assetsById = new Map<string, RegisteredImageAsset>();
  assetsBySrc.forEach((asset) => assetsById.set(asset.id, asset));

  const uniqueIds = Array.from(new Set(ids));
  const resolved = await Promise.all(
    uniqueIds.map(async (id): Promise<ResolvedImageAsset | null> => {
      const asset = assetsById.get(id);
      if (!asset) {
        return null;
      }

      const blob = await asset.blobPromise;
      if (!blob) {
        return null;
      }

      return { id: asset.id, localPath: asset.localPath, blob };
    })
  );

  return resolved.filter((entry): entry is ResolvedImageAsset => entry !== null);
}
