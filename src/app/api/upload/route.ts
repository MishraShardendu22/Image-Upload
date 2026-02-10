import { NextRequest, NextResponse } from "next/server";
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

    const dataUri = `data:${mimeType};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "image-upload-app",
      resource_type: "auto",
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
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
