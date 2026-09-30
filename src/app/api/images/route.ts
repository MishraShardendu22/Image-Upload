import { type NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import {
  getFolderTree,
  getImageCount,
  listFolders,
  listImages,
  saveImageRecord,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const requestedFolder = searchParams.get("folder")?.trim() || "";
    const searchQuery = searchParams.get("search")?.trim() || "";

    const cleanFolder = requestedFolder
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");

    // Check if SQLite database has records. If empty, attempt one-time backfill from Cloudinary
    const totalCount = getImageCount();
    const hasCloudinary = Boolean(
      process.env.CLOUDINARY_URL ||
        (process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET),
    );

    if (totalCount === 0 && hasCloudinary) {
      try {
        const result = await cloudinary.api.resources({
          type: "upload",
          prefix: "image-upload-app",
          resource_type: "image",
          max_results: 500,
        });

        for (const resource of result.resources) {
          const cleanPublicId = resource.public_id.replace(
            /^image-upload-app\/?/,
            "",
          );
          const parts = cleanPublicId.split("/");
          const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
          const filename = `${parts[parts.length - 1]}.${resource.format || "png"}`;
          const relativePath = folder ? `${folder}/${filename}` : filename;

          saveImageRecord({
            public_id: resource.public_id,
            filename,
            relative_path: relativePath,
            folder_path: folder,
            local_url: `/uploads/${relativePath}`,
            secure_url: resource.secure_url || resource.url,
            width: resource.width,
            height: resource.height,
            format: resource.format || "png",
            bytes: resource.bytes || 0,
            created_at: resource.created_at || new Date().toISOString(),
          });
        }
      } catch (cloudErr) {
        console.warn("Backfill from Cloudinary skipped/failed:", cloudErr);
      }
    }

    // Query images from local SQLite database
    const imagesFromDb = listImages({
      folder: cleanFolder === "all" ? undefined : cleanFolder,
      search: searchQuery || undefined,
    });

    const foldersList = listFolders();
    const folderTree = getFolderTree();

    const formattedImages = imagesFromDb.map((img) => ({
      public_id: img.public_id,
      secure_url: img.secure_url || img.local_url,
      local_url: img.local_url,
      url: img.secure_url || img.local_url,
      width: img.width || 0,
      height: img.height || 0,
      format: img.format,
      bytes: img.bytes,
      created_at: img.created_at,
      folder: img.folder_path,
      folder_path: img.folder_path,
      filename: img.filename,
      relative_path: img.relative_path,
    }));

    return NextResponse.json({
      images: formattedImages,
      folders: foldersList.map((f) => f.path),
      folderDetails: foldersList,
      folderTree,
      total: formattedImages.length,
    });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json(
      { error: "Failed to list images" },
      { status: 500 },
    );
  }
}
