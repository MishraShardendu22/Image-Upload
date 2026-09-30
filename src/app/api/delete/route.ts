import fs from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { deleteImageRecord, getImageByPublicId } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { public_id } = await request.json();

    if (!public_id) {
      return NextResponse.json(
        { error: "No public_id provided" },
        { status: 400 },
      );
    }

    // 1. Check SQLite for record
    const record = getImageByPublicId(public_id);

    // 2. Delete local file from disk if present
    if (record) {
      try {
        const localFilePath = path.join(
          process.cwd(),
          "public",
          "uploads",
          record.relative_path,
        );
        await fs.unlink(localFilePath);
      } catch (fileErr) {
        console.warn(
          `Local file deletion skipped/failed for ${public_id}:`,
          fileErr,
        );
      }
    }

    // 3. Remove record from SQLite
    deleteImageRecord(public_id);

    // 4. If Cloudinary is configured and asset has Cloudinary public_id, destroy it
    const hasCloudinary = Boolean(
      process.env.CLOUDINARY_URL ||
        (process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET),
    );

    if (hasCloudinary && !public_id.startsWith("local/")) {
      try {
        await cloudinary.uploader.destroy(public_id);
      } catch (cloudErr) {
        console.warn(
          `Cloudinary destruction skipped/failed for ${public_id}:`,
          cloudErr,
        );
      }
    }

    return NextResponse.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 },
    );
  }
}
