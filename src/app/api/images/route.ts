import { type NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const requestedFolder = searchParams.get("folder")?.trim() || "";

    const cleanFolder = requestedFolder
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");

    const prefix = cleanFolder
      ? `image-upload-app/${cleanFolder}`
      : "image-upload-app";

    const result = await cloudinary.api.resources({
      type: "upload",
      prefix,
      resource_type: "image",
      max_results: 500,
    });

    const images = result.resources.map(
      (resource: {
        public_id: string;
        secure_url: string;
        url: string;
        width: number;
        height: number;
        format: string;
        bytes: number;
        created_at: string;
      }) => {
        // Extract relative subfolder path from public_id
        const cleanPublicId = resource.public_id.replace(
          /^image-upload-app\/?/,
          "",
        );
        const parts = cleanPublicId.split("/");
        const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        const filename = parts[parts.length - 1];

        return {
          public_id: resource.public_id,
          secure_url: resource.secure_url,
          url: resource.url,
          width: resource.width,
          height: resource.height,
          format: resource.format,
          bytes: resource.bytes,
          created_at: resource.created_at,
          folder,
          filename,
        };
      },
    );

    // Extract all unique folders found across images
    const folderSet = new Set<string>();
    for (const img of images) {
      if (img.folder) {
        folderSet.add(img.folder);
      }
    }
    const folders = Array.from(folderSet).sort();

    return NextResponse.json({ images, folders });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json(
      { error: "Failed to list images" },
      { status: 500 },
    );
  }
}
