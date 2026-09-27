import { type NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    // Some files (e.g. .ico) may have missing or incorrect MIME types
    let mimeType = file.type;
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        ico: "image/x-icon",
        avif: "image/avif",
        heic: "image/heic",
        heif: "image/heif",
        webp: "image/webp",
        svg: "image/svg+xml",
        bmp: "image/bmp",
        tiff: "image/tiff",
        tif: "image/tiff",
      };
      mimeType = (ext && mimeMap[ext]) || "image/png";
    }

    const rawFolder = (formData.get("folder") as string | null) || "";
    const rawRelativePath =
      (formData.get("relativePath") as string | null) || "";

    // Determine target subfolder from folder or relativePath
    let subfolder = rawFolder.trim();
    if (!subfolder && rawRelativePath) {
      const parts = rawRelativePath.split(/[/\\]/);
      if (parts.length > 1) {
        parts.pop();
        subfolder = parts.join("/");
      }
    }

    // Clean folder path: normalize slashes, prevent directory traversal
    const cleanSubfolder = subfolder
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");

    const targetFolder = cleanSubfolder
      ? `image-upload-app/${cleanSubfolder}`
      : "image-upload-app";

    const dataUri = `data:${mimeType};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: targetFolder,
      resource_type: "auto",
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    });

    return NextResponse.json({
      public_id: result.public_id,
      secure_url: result.secure_url,
      url: result.url,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      created_at: result.created_at,
      folder: cleanSubfolder,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
