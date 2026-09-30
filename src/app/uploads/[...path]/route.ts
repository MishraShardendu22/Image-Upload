import fs from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await context.params;
    if (!segments || segments.length === 0) {
      return new NextResponse("File path required", { status: 400 });
    }

    // Sanitize and prevent directory traversal
    const safeSegments = segments.filter(
      (s) => s && s !== "." && s !== ".." && !s.includes("\\"),
    );

    const filePath = path.join(
      process.cwd(),
      "public",
      "uploads",
      ...safeSegments,
    );

    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
