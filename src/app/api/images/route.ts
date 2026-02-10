import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export async function GET() {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: "image-upload-app",
      resource_type: "image",
      max_results: 100,
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
      }) => ({
        public_id: resource.public_id,
        secure_url: resource.secure_url,
        url: resource.url,
        width: resource.width,
        height: resource.height,
        format: resource.format,
        bytes: resource.bytes,
        created_at: resource.created_at,
      }),
    );

    return NextResponse.json({ images });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json(
      { error: "Failed to list images" },
      { status: 500 },
    );
  }
}
