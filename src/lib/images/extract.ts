import { unzip } from "fflate";
import { isImageMimeType, isImageExtension } from "./config";

export interface ExtractedFile {
  file: File;
  originalPath: string;
}

export async function extractImages(input: FileList | File[]): Promise<ExtractedFile[]> {
  const files = Array.from(input);
  const results: ExtractedFile[] = [];

  for (const file of files) {
    const extracted = await extractFromFile(file);
    results.push(...extracted);
  }

  return results;
}

async function extractFromFile(file: File): Promise<ExtractedFile[]> {
  if (file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip")) {
    return extractFromZip(file);
  }

  if (file.type.startsWith("image/")) {
    return [{ file, originalPath: file.name }];
  }

  if (isImageExtension(file.name) && file.size > 0) {
    return [{ file, originalPath: file.name }];
  }

  if (file.type === "" && file.size === 0 && file.name !== "") {
    return [];
  }

  return [];
}

async function extractFromZip(zipFile: File): Promise<ExtractedFile[]> {
  const buffer = await zipFile.arrayBuffer();

  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), (err, files) => {
      if (err) {
        reject(err);
        return;
      }

      const results: ExtractedFile[] = [];
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
      };

      for (const [filename, data] of Object.entries(files)) {
        if (filename.endsWith("/")) continue;

        const pathParts = filename.split("/");
        if (pathParts.length > 2) continue;

        const ext = filename.split(".").pop()?.toLowerCase();
        const mimeType = ext ? mimeMap[ext] : undefined;

        if (!mimeType) continue;

        const blob = new Blob([data], { type: mimeType });
        const file = new File([blob], filename.split("/").pop() || filename, { type: mimeType });
        results.push({ file, originalPath: filename });
      }

      resolve(results);
    });
  });
}

export function filterValidImages(files: ExtractedFile[]): ExtractedFile[] {
  return files.filter(({ file }) => {
    if (file.size === 0) return false;
    if (isImageMimeType(file.type)) return true;
    return isImageExtension(file.name);
  });
}
