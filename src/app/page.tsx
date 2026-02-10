"use client";

import { useState, useEffect, useCallback } from "react";

interface CloudinaryImage {
  public_id: string;
  secure_url: string;
  url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  created_at: string;
}

export default function Home() {
  const [images, setImages] = useState<CloudinaryImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
      setLoggingOut(false);
    }
  };

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      if (data.images) {
        setImages(data.images);
      }
    } catch (error) {
      console.error("Failed to fetch images:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const uploadFile = async (file: File) => {
    const imageExtensions = [
      ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
      ".avif", ".bmp", ".tiff", ".tif", ".ico", ".heic", ".heif",
    ];
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    const isImage =
      file.type.startsWith("image/") || imageExtensions.includes(ext);
    if (!isImage) {
      alert("Please upload an image file.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setImages((prev) => [data, ...prev]);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        uploadFile(file);
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        uploadFile(file);
      }
    }
  };

  const deleteImage = async (publicId: string) => {
    if (!confirm("Are you sure you want to delete this image?")) return;

    setDeletingId(publicId);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_id: publicId }),
      });

      if (!res.ok) throw new Error("Delete failed");

      setImages((prev) => prev.filter((img) => img.public_id !== publicId));
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete image.");
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = (url: string, publicId: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(publicId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-indigo-400">Image</span> Upload
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {images.length} image{images.length !== 1 && "s"}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Upload Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200
            ${
              dragActive
                ? "border-indigo-400 bg-indigo-400/5"
                : "border-gray-700 hover:border-gray-600 bg-gray-900/50"
            }
            ${uploading ? "opacity-60 pointer-events-none" : "cursor-pointer"}
          `}
          onClick={() => document.getElementById("file-input")?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              document.getElementById("file-input")?.click();
            }
          }}
        >
          <input
            id="file-input"
            type="file"
            accept="image/*,.avif,.heic,.heif,.webp,.svg,.bmp,.tiff"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-xl bg-gray-800 flex items-center justify-center">
              {uploading ? (
                <svg
                  className="w-6 h-6 text-indigo-400 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                  />
                </svg>
              )}
            </div>

            <div>
              <p className="text-gray-300 font-medium">
                {uploading
                  ? "Uploading..."
                  : "Drop images here or click to browse"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                PNG, JPG, GIF, WebP, AVIF, SVG, BMP, TIFF, HEIC & more
              </p>
            </div>
          </div>
        </div>

        {/* Image Grid */}
        {loading ? (
          <div className="text-center py-16">
            <svg
              className="w-8 h-8 text-gray-600 animate-spin mx-auto"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-gray-500 mt-3">Loading images...</p>
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-900 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-gray-500">
              No images yet. Upload one to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((image) => (
              <div
                key={image.public_id}
                className="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors"
              >
                {/* Image Preview */}
                <div className="relative aspect-video bg-gray-800 overflow-hidden">
                  <img
                    src={image.secure_url}
                    alt={image.public_id}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info & Actions */}
                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {image.public_id.split("/").pop()}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{image.format.toUpperCase()}</span>
                      <span>·</span>
                      <span>
                        {image.width}x{image.height}
                      </span>
                      <span>·</span>
                      <span>{formatBytes(image.bytes)}</span>
                    </div>
                  </div>

                  {/* URL Display */}
                  <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400 truncate font-mono">
                      {image.secure_url}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        copyLink(image.secure_url, image.public_id)
                      }
                      className="flex-1 text-sm px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors font-medium cursor-pointer"
                    >
                      {copiedId === image.public_id ? "Copied!" : "Copy Link"}
                    </button>

                    <button
                      type="button"
                      onClick={() => window.open(image.secure_url, "_blank")}
                      className="text-sm px-3 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
                    >
                      Open
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteImage(image.public_id)}
                      disabled={deletingId === image.public_id}
                      className="text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deletingId === image.public_id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
