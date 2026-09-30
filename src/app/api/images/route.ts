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

    const hasCloudinary = Boolean(
      process.env.CLOUDINARY_URL ||
        (process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET),
    );

    // 1. Check if SQLite database has records. If empty, attempt one-time backfill from Cloudinary
    let totalCount = 0;
    try {
      totalCount = getImageCount();
    } catch (err) {
      console.warn("Error reading SQLite image count:", err);
    }

    if (totalCount === 0 && hasCloudinary) {
      try {
        const result = await cloudinary.api.resources({
          type: "upload",
          prefix: "image-upload-app",
          resource_type: "image",
          max_results: 500,
        });

        if (result?.resources?.length) {
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
        }
      } catch (cloudErr) {
        console.warn("Backfill from Cloudinary skipped/failed:", cloudErr);
      }
    }

    // 2. Query images from local SQLite database
    let formattedImages: Array<{
      public_id: string;
      secure_url: string;
      local_url?: string;
      url: string;
      width: number;
      height: number;
      format: string;
      bytes: number;
      created_at: string;
      folder?: string;
      folder_path?: string;
      filename: string;
      relative_path: string;
    }> = [];
    let foldersList: Array<{ path: string; name: string; count: number }> = [];
    let folderTree: ReturnType<typeof getFolderTree> = [];

    try {
      const imagesFromDb = listImages({
        folder: cleanFolder === "all" ? undefined : cleanFolder,
        search: searchQuery || undefined,
      });

      if (imagesFromDb && imagesFromDb.length > 0) {
        formattedImages = imagesFromDb.map((img) => ({
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

        foldersList = listFolders();
        folderTree = getFolderTree();
      }
    } catch (dbErr) {
      console.warn("SQLite listImages query failed:", dbErr);
    }

    // 3. Resilient Fallback: If DB query yielded 0 images and Cloudinary is configured, fetch directly from Cloudinary
    if (formattedImages.length === 0 && hasCloudinary) {
      try {
        const result = await cloudinary.api.resources({
          type: "upload",
          prefix: "image-upload-app",
          resource_type: "image",
          max_results: 500,
        });

        if (result?.resources?.length) {
          const cloudImages = result.resources.map(
            (resource: {
              public_id: string;
              secure_url?: string;
              url?: string;
              width?: number;
              height?: number;
              format?: string;
              bytes?: number;
              created_at?: string;
            }) => {
              const cleanPublicId = resource.public_id.replace(
                /^image-upload-app\/?/,
                "",
              );
              const parts = cleanPublicId.split("/");
              const folder =
                parts.length > 1 ? parts.slice(0, -1).join("/") : "";
              const filename = `${parts[parts.length - 1]}.${resource.format || "png"}`;
              const relativePath = folder ? `${folder}/${filename}` : filename;

              return {
                public_id: resource.public_id,
                secure_url: resource.secure_url || resource.url || "",
                local_url: resource.secure_url || resource.url || "",
                url: resource.secure_url || resource.url || "",
                width: resource.width || 0,
                height: resource.height || 0,
                format: resource.format || "png",
                bytes: resource.bytes || 0,
                created_at: resource.created_at || new Date().toISOString(),
                folder,
                folder_path: folder,
                filename,
                relative_path: relativePath,
              };
            },
          );

          // Apply folder filtering
          let filtered = cloudImages;
          if (cleanFolder && cleanFolder !== "all") {
            filtered = cloudImages.filter(
              (img: { folder?: string }) =>
                img.folder === cleanFolder ||
                img.folder?.startsWith(`${cleanFolder}/`),
            );
          }

          // Apply search filtering
          if (searchQuery) {
            const lowerSearch = searchQuery.toLowerCase();
            filtered = filtered.filter(
              (img: { filename: string; relative_path: string }) =>
                img.filename.toLowerCase().includes(lowerSearch) ||
                img.relative_path.toLowerCase().includes(lowerSearch),
            );
          }

          // Extract distinct folder paths
          const folderMap = new Map<string, number>();
          for (const img of cloudImages) {
            if (img.folder) {
              folderMap.set(img.folder, (folderMap.get(img.folder) || 0) + 1);
            }
          }

          const extractedFolders = Array.from(folderMap.entries()).map(
            ([path, count]) => ({
              path,
              name: path.split("/").pop() || path,
              count,
            }),
          );

          return NextResponse.json({
            images: filtered,
            folders: extractedFolders.map((f) => f.path),
            folderDetails: extractedFolders,
            folderTree: [],
            total: filtered.length,
          });
        }
      } catch (cloudErr) {
        console.warn("Direct Cloudinary fetch failed:", cloudErr);
      }
    }

    return NextResponse.json({
      images: formattedImages,
      folders: foldersList.map((f) => f.path),
      folderDetails: foldersList,
      folderTree,
      total: formattedImages.length,
    });
  } catch (error) {
    console.error("List error:", error);
    // Return empty result rather than 500 so UI displays properly with empty state
    return NextResponse.json({
      images: [],
      folders: [],
      folderDetails: [],
      folderTree: [],
      total: 0,
    });
  }
}
