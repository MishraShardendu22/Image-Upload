import fs from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { saveImageRecord } from "@/lib/db";

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

    const safeFilename = path.basename(file.name);
    const ext = safeFilename.split(".").pop()?.toLowerCase() || "png";

    // Some files (e.g. .ico) may have missing or incorrect MIME types
    let mimeType = file.type;
    if (!mimeType || mimeType === "application/octet-stream") {
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
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
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
        parts.pop(); // remove file name to get folder path
        subfolder = parts.join("/");
      }
    }

    // Clean folder path: normalize slashes, prevent directory traversal
    const cleanSubfolder = subfolder
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");

    const relativePath = cleanSubfolder
      ? `${cleanSubfolder}/${safeFilename}`
      : safeFilename;

    // 1. Save file locally matching folder structure
    const uploadsBaseDir = path.join(process.cwd(), "public", "uploads");
    const targetDiskDir = cleanSubfolder
      ? path.join(uploadsBaseDir, cleanSubfolder)
      : uploadsBaseDir;

    await fs.mkdir(targetDiskDir, { recursive: true });
    const localDiskPath = path.join(targetDiskDir, safeFilename);
    await fs.writeFile(localDiskPath, buffer);

    // Build local URL
    const encodedSubfolder = cleanSubfolder
      ? cleanSubfolder.split("/").map(encodeURIComponent).join("/")
      : "";
    const localUrl = encodedSubfolder
      ? `/uploads/${encodedSubfolder}/${encodeURIComponent(safeFilename)}`
      : `/uploads/${encodeURIComponent(safeFilename)}`;

    // Fallback defaults for local storage
    const baseName = safeFilename.replace(/\.[^/.]+$/, "");
    let publicId = cleanSubfolder
      ? `local/${cleanSubfolder}/${baseName}`
      : `local/${baseName}`;
    let secureUrl = localUrl;
    let width: number | undefined;
    let height: number | undefined;
    let format = ext;
    let bytesCount = buffer.byteLength;
    let createdAt = new Date().toISOString();

    // 2. Upload to Cloudinary CDN if credentials exist
    const hasCloudinary = Boolean(
      process.env.CLOUDINARY_URL ||
        (process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET),
    );

    if (hasCloudinary) {
      try {
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

        publicId = result.public_id;
        secureUrl = result.secure_url;
        width = result.width;
        height = result.height;
        format = result.format;
        bytesCount = result.bytes;
        createdAt = result.created_at || createdAt;
      } catch (cloudErr) {
        console.warn(
          "Cloudinary upload failed or not configured, using local storage:",
          cloudErr,
        );
      }
    }

    // 3. Save to local SQLite database
    saveImageRecord({
      public_id: publicId,
      filename: safeFilename,
      relative_path: relativePath,
      folder_path: cleanSubfolder,
      local_url: localUrl,
      secure_url: secureUrl,
      width,
      height,
      format,
      bytes: bytesCount,
      created_at: createdAt,
    });

    return NextResponse.json({
      public_id: publicId,
      secure_url: secureUrl,
      local_url: localUrl,
      url: secureUrl,
      width: width || 0,
      height: height || 0,
      format,
      bytes: bytesCount,
      created_at: createdAt,
      folder: cleanSubfolder,
      folder_path: cleanSubfolder,
      filename: safeFilename,
      relative_path: relativePath,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
