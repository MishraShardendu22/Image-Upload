"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface CloudinaryImage {
  public_id: string;
  secure_url: string;
  url: string;
  local_url?: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  created_at: string;
  folder?: string;
  folder_path?: string;
  filename?: string;
  relative_path?: string;
}

interface UploadItem {
  file: File;
  relativePath?: string;
  folder?: string;
}

interface WebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface WebkitFileEntry extends WebkitEntry {
  file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
}

interface WebkitDirectoryEntry extends WebkitEntry {
  createReader: () => {
    readEntries: (
      success: (entries: WebkitEntry[]) => void,
      error?: (err: unknown) => void,
    ) => void;
  };
}

function FolderIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

export default function Home() {
  const [images, setImages] = useState<CloudinaryImage[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [includeSubfolders, setIncludeSubfolders] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [customFolder, setCustomFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    errors: string[];
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [previewImage, setPreviewImage] = useState<CloudinaryImage | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
      if (data.folders) {
        setFolders(data.folders);
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

  // Recursively scan dropped folders and files
  const scanEntry = async (
    entry: WebkitEntry,
    parentPath = "",
  ): Promise<UploadItem[]> => {
    const items: UploadItem[] = [];

    if (entry.isFile) {
      const fileEntry = entry as WebkitFileEntry;
      await new Promise<void>((resolve) => {
        fileEntry.file(
          (file) => {
            const relPath = parentPath
              ? `${parentPath}/${file.name}`
              : file.name;
            items.push({ file, relativePath: relPath });
            resolve();
          },
          () => resolve(),
        );
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as WebkitDirectoryEntry;
      const reader = dirEntry.createReader();
      const currentDirPath = parentPath
        ? `${parentPath}/${entry.name}`
        : entry.name;

      const readBatch = async (): Promise<WebkitEntry[]> => {
        return new Promise((resolve) => {
          reader.readEntries(
            (entries) => resolve(entries),
            () => resolve([]),
          );
        });
      };

      let allEntries: WebkitEntry[] = [];
      while (true) {
        const batch = await readBatch();
        if (batch.length === 0) break;
        allEntries = allEntries.concat(batch);
      }

      for (const child of allEntries) {
        const nested = await scanEntry(child, currentDirPath);
        items.push(...nested);
      }
    }

    return items;
  };

  // Upload a batch of items
  const uploadBatch = async (items: UploadItem[]) => {
    const validExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".avif",
      ".bmp",
      ".tiff",
      ".tif",
      ".ico",
      ".heic",
      ".heif",
    ];

    const validItems = items.filter((item) => {
      const ext = `.${item.file.name.split(".").pop()?.toLowerCase()}`;
      return (
        item.file.type.startsWith("image/") || validExtensions.includes(ext)
      );
    });

    if (validItems.length === 0) {
      alert("No valid image files found in selection.");
      return;
    }

    setUploading(true);
    setUploadProgress({
      current: 0,
      total: validItems.length,
      currentName: validItems[0].relativePath || validItems[0].file.name,
      errors: [],
    });

    const newUploaded: CloudinaryImage[] = [];
    const errors: string[] = [];

    // Concurrency limit of 3
    const concurrency = 3;
    let index = 0;

    const worker = async () => {
      while (index < validItems.length) {
        const currentItemIndex = index++;
        const item = validItems[currentItemIndex];
        const displayName = item.relativePath || item.file.name;

        setUploadProgress((prev) =>
          prev
            ? {
                ...prev,
                current: currentItemIndex + 1,
                currentName: displayName,
              }
            : null,
        );

        try {
          const formData = new FormData();
          formData.append("file", item.file);

          if (item.relativePath) {
            formData.append("relativePath", item.relativePath);
          } else if (item.folder) {
            formData.append("folder", item.folder);
          } else if (customFolder.trim()) {
            formData.append("folder", customFolder.trim());
          }

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error(`Upload failed for ${displayName}`);
          }

          const uploadedData: CloudinaryImage = await res.json();
          newUploaded.push(uploadedData);
        } catch (err) {
          console.error(`Failed uploading ${displayName}:`, err);
          errors.push(displayName);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, validItems.length) },
      () => worker(),
    );
    await Promise.all(workers);

    // Refresh database view from SQLite backend
    await fetchImages();

    setUploading(false);
    if (errors.length > 0) {
      alert(
        `Completed with ${errors.length} failed upload(s):\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? "\n...and more" : ""}`,
      );
    }
    setUploadProgress(null);
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: UploadItem[] = Array.from(files).map((f) => ({
      file: f,
      folder: customFolder.trim() || undefined,
    }));

    uploadBatch(items);
    e.target.value = "";
  };

  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: UploadItem[] = Array.from(files).map((f) => {
      const relPath =
        (f as { webkitRelativePath?: string }).webkitRelativePath || f.name;
      return {
        file: f,
        relativePath: relPath,
      };
    });

    uploadBatch(items);
    e.target.value = "";
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (uploading) return;

    const items: UploadItem[] = [];
    const dtItems = e.dataTransfer.items;

    if (dtItems && dtItems.length > 0) {
      const entryPromises: Promise<UploadItem[]>[] = [];
      for (let i = 0; i < dtItems.length; i++) {
        const item = dtItems[i];
        if (
          typeof (item as { webkitGetAsEntry?: () => WebkitEntry | null })
            .webkitGetAsEntry === "function"
        ) {
          const entry = (
            item as { webkitGetAsEntry: () => WebkitEntry | null }
          ).webkitGetAsEntry();
          if (entry) {
            entryPromises.push(scanEntry(entry));
          }
        }
      }

      if (entryPromises.length > 0) {
        const results = await Promise.all(entryPromises);
        for (const res of results) {
          items.push(...res);
        }
      }
    }

    if (items.length === 0 && e.dataTransfer.files?.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        items.push({
          file,
          folder: customFolder.trim() || undefined,
        });
      }
    }

    if (items.length > 0) {
      uploadBatch(items);
    }
  };

  const deleteImage = async (publicId: string) => {
    if (!confirm(`Are you sure you want to delete this asset?\n${publicId}`))
      return;

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

  const copyLink = (textToCopy: string, id: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  };

  // Compute folder hierarchy counts
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: images.length,
      root: 0,
    };

    for (const img of images) {
      const f = img.folder || img.folder_path || "";
      if (!f) {
        counts.root = (counts.root || 0) + 1;
      } else {
        counts[f] = (counts[f] || 0) + 1;
        const parts = f.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          counts[acc] = (counts[acc] || 0) + 1;
        }
      }
    }

    return counts;
  }, [images]);

  // Compute subfolders in the current navigation scope
  const subfoldersInCurrentScope = useMemo(() => {
    if (selectedFolder === "root") return [];

    if (selectedFolder === "all") {
      const topSet = new Set<string>();
      for (const f of folders) {
        if (!f) continue;
        const top = f.split("/")[0];
        topSet.add(top);
      }
      return Array.from(topSet).sort();
    }

    const prefix = `${selectedFolder}/`;
    const subSet = new Set<string>();
    for (const f of folders) {
      if (f.startsWith(prefix)) {
        const remainder = f.slice(prefix.length);
        const directChild = remainder.split("/")[0];
        subSet.add(`${selectedFolder}/${directChild}`);
      }
    }
    return Array.from(subSet).sort();
  }, [folders, selectedFolder]);

  // Filter images by folder and search term
  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      const folder = img.folder || img.folder_path || "";

      // Folder match
      if (selectedFolder === "root") {
        if (folder) return false;
      } else if (selectedFolder !== "all") {
        if (includeSubfolders) {
          if (
            folder !== selectedFolder &&
            !folder.startsWith(`${selectedFolder}/`)
          ) {
            return false;
          }
        } else {
          if (folder !== selectedFolder) {
            return false;
          }
        }
      }

      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = (img.filename || img.public_id)
          .toLowerCase()
          .includes(query);
        const matchesRelPath = (img.relative_path || "")
          .toLowerCase()
          .includes(query);
        const matchesFolder = folder.toLowerCase().includes(query);
        const matchesFormat = img.format.toLowerCase().includes(query);
        return matchesName || matchesRelPath || matchesFolder || matchesFormat;
      }

      return true;
    });
  }, [images, selectedFolder, includeSubfolders, searchQuery]);

  return (
    <main className="min-h-screen bg-[#0e0c0a] text-[#f3ebdd] relative selection:bg-[#d9a55b]/30 selection:text-[#f3ebdd]">
      {/* Ambient planetary glow */}
      <div className="fixed top-0 left-1/4 -translate-y-1/2 w-[600px] h-[600px] bg-[#d9a55b]/4 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 translate-y-1/2 w-[500px] h-[500px] bg-[#e8893f]/3 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Header */}
      <header className="border-b border-[#2f2923] bg-[#0e0c0a]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#161311] border border-[#2f2923] flex items-center justify-center text-[#d9a55b] shadow-inner">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                <span className="text-[#d9a55b]">Observatory</span> CDN
              </h1>
              <p className="text-xs text-[#8e8374]">
                Planetary Asset Storage & CDN Generation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161311] border border-[#2f2923] text-xs text-[#b9ae9d]">
              <span className="w-2 h-2 rounded-full bg-[#4caf7d]" />
              <span>{images.length} assets</span>
              <span className="text-[#8e8374]">·</span>
              <span>{folders.length} folders</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-xs px-3.5 py-2 rounded-xl bg-[#1e1a16] text-[#b9ae9d] hover:text-[#f3ebdd] hover:bg-[#27221c] border border-[#2f2923] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Upload Hub */}
        <section className="bg-[#161311] border border-[#2f2923] rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#f3ebdd] flex items-center gap-2">
                <span>Upload Assets</span>
                <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[#d9a55b]/10 text-[#d9a55b] border border-[#d9a55b]/20">
                  Folder Structure Preserved
                </span>
                <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[#4caf7d]/10 text-[#4caf7d] border border-[#4caf7d]/20">
                  SQLite Indexed
                </span>
              </h2>
              <p className="text-xs text-[#8e8374] mt-1">
                Upload individual files, select an entire directory, or drag &
                drop nested folders to preserve structure on disk and in
                database.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="custom-folder-input"
                className="text-xs text-[#8e8374] shrink-0"
              >
                Default Folder:
              </label>
              <input
                id="custom-folder-input"
                type="text"
                value={customFolder}
                onChange={(e) => setCustomFolder(e.target.value)}
                placeholder="e.g. Design/assets"
                className="w-44 text-xs px-3 py-1.5 bg-[#1e1a16] border border-[#2f2923] rounded-lg text-[#f3ebdd] placeholder-[#8e8374] focus:outline-none focus:border-[#d9a55b]"
              />
            </div>
          </div>

          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            id="file-input"
            type="file"
            accept="image/*,.avif,.heic,.heif,.webp,.svg,.bmp,.tiff"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />

          <input
            ref={folderInputRef}
            id="folder-input"
            type="file"
            // @ts-expect-error webkitdirectory is standard in browsers but non-standard in React HTMLAttributes
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderSelected}
            className="hidden"
          />

          {/* Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all duration-200
              ${
                dragActive
                  ? "border-[#d9a55b] bg-[#d9a55b]/8 shadow-lg shadow-[#d9a55b]/5"
                  : "border-[#2f2923] hover:border-[#413930] bg-[#1e1a16]/40"
              }
              ${uploading ? "opacity-60 pointer-events-none" : ""}
            `}
          >
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1e1a16] border border-[#2f2923] flex items-center justify-center text-[#d9a55b] shadow-inner">
                {uploading ? (
                  <svg
                    className="w-7 h-7 animate-spin text-[#d9a55b]"
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
                    className="w-7 h-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-[#f3ebdd]">
                  {uploading
                    ? "Uploading assets to CDN & Local Archive..."
                    : "Drag and drop images or whole folders here"}
                </p>
                <p className="text-xs text-[#8e8374] mt-1">
                  Preserves subfolder hierarchy, stores files locally & indexes
                  in SQLite
                </p>
              </div>

              {/* Action Buttons */}
              {!uploading && (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold px-4 py-2.5 rounded-xl bg-[#d9a55b] hover:bg-[#e6b56c] active:bg-[#c59146] text-[#0e0c0a] transition-all shadow-md cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    <span>Upload Images</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="text-xs font-medium px-4 py-2.5 rounded-xl bg-[#1e1a16] hover:bg-[#27221c] border border-[#2f2923] hover:border-[#413930] text-[#f3ebdd] transition-all cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4 text-[#d9a55b]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    <span>Upload Entire Folder</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress && (
            <div className="bg-[#1e1a16] border border-[#2f2923] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#f3ebdd] font-medium truncate max-w-md">
                  Uploading: {uploadProgress.currentName}
                </span>
                <span className="text-[#d9a55b] font-mono">
                  {uploadProgress.current} / {uploadProgress.total} (
                  {Math.round(
                    (uploadProgress.current / uploadProgress.total) * 100,
                  )}
                  %)
                </span>
              </div>
              <div className="w-full bg-[#161311] h-2 rounded-full overflow-hidden border border-[#2f2923]">
                <div
                  className="bg-[#d9a55b] h-full transition-all duration-200"
                  style={{
                    width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Gallery Controls & Navigation */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <svg
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8e8374]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename, relative path, or folder..."
                className="w-full pl-10 pr-4 py-2 bg-[#161311] border border-[#2f2923] rounded-xl text-xs text-[#f3ebdd] placeholder-[#8e8374] focus:outline-none focus:border-[#d9a55b] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8e8374] hover:text-[#f3ebdd] cursor-pointer"
                  aria-label="Clear search query"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="text-xs text-[#8e8374] flex items-center gap-4">
              {selectedFolder !== "all" && selectedFolder !== "root" && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[#b9ae9d] hover:text-[#f3ebdd]">
                  <input
                    type="checkbox"
                    checked={includeSubfolders}
                    onChange={(e) => setIncludeSubfolders(e.target.checked)}
                    className="accent-[#d9a55b] rounded cursor-pointer"
                  />
                  <span>Include subfolders</span>
                </label>
              )}

              <span>
                Showing {filteredImages.length} of {images.length} assets
              </span>
            </div>
          </div>

          {/* Breadcrumb Navigation Bar */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#8e8374] bg-[#161311] border border-[#2f2923] px-4 py-2.5 rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedFolder("all")}
              className={`hover:text-[#f3ebdd] transition-colors flex items-center gap-1.5 cursor-pointer ${
                selectedFolder === "all" ? "text-[#d9a55b] font-semibold" : ""
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              <span>All Assets</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#1e1a16] text-[#8e8374]">
                {folderCounts.all || 0}
              </span>
            </button>

            {folderCounts.root > 0 && (
              <>
                <span className="text-[#413930]">/</span>
                <button
                  type="button"
                  onClick={() => setSelectedFolder("root")}
                  className={`hover:text-[#f3ebdd] transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedFolder === "root"
                      ? "text-[#d9a55b] font-semibold"
                      : ""
                  }`}
                >
                  <FolderIcon className="w-3.5 h-3.5 text-[#d9a55b]" />
                  <span>root</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#1e1a16] text-[#8e8374]">
                    {folderCounts.root}
                  </span>
                </button>
              </>
            )}

            {selectedFolder !== "all" &&
              selectedFolder !== "root" &&
              selectedFolder.split("/").map((part, index, arr) => {
                const pathUpToHere = arr.slice(0, index + 1).join("/");
                const isLast = index === arr.length - 1;
                return (
                  <span
                    key={pathUpToHere}
                    className="flex items-center gap-1.5"
                  >
                    <span className="text-[#413930]">/</span>
                    {isLast ? (
                      <span className="text-[#d9a55b] font-semibold flex items-center gap-1.5">
                        <FolderIcon className="w-3.5 h-3.5 text-[#d9a55b]" />
                        <span>{part}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#1e1a16] text-[#8e8374]">
                          {folderCounts[pathUpToHere] || 0}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedFolder(pathUpToHere)}
                        className="hover:text-[#f3ebdd] transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <FolderIcon className="w-3.5 h-3.5 text-[#8e8374]" />
                        <span>{part}</span>
                      </button>
                    )}
                  </span>
                );
              })}
          </div>

          {/* Subfolders Quick-Explorer Chips */}
          {subfoldersInCurrentScope.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-[#8e8374] uppercase tracking-wider">
                {selectedFolder === "all" ? "Top-level Folders" : "Subfolders"}
              </p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {subfoldersInCurrentScope.map((sub) => {
                  const label = sub.split("/").pop() || sub;
                  const count = folderCounts[sub] || 0;
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSelectedFolder(sub)}
                      className="text-xs px-3 py-1.5 rounded-xl bg-[#161311] hover:bg-[#1e1a16] border border-[#2f2923] hover:border-[#d9a55b]/40 text-[#f3ebdd] transition-all shrink-0 cursor-pointer flex items-center gap-2 group"
                    >
                      <FolderIcon className="w-3.5 h-3.5 text-[#d9a55b]" />
                      <span className="group-hover:text-[#d9a55b] transition-colors">
                        {label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#1e1a16] text-[#8e8374] font-mono">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Assets Grid */}
        {loading ? (
          <div className="text-center py-24 space-y-3">
            <div className="w-10 h-10 mx-auto rounded-xl bg-[#161311] border border-[#2f2923] flex items-center justify-center text-[#d9a55b]">
              <svg
                className="w-5 h-5 animate-spin"
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
            </div>
            <p className="text-xs text-[#8e8374]">
              Scanning Observatory SQLite archive...
            </p>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="text-center py-24 bg-[#161311] border border-[#2f2923] rounded-2xl p-8 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1e1a16] border border-[#2f2923] flex items-center justify-center text-[#8e8374]">
              <svg
                className="w-7 h-7"
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
            <p className="text-sm font-medium text-[#f3ebdd]">
              No assets found
            </p>
            <p className="text-xs text-[#8e8374]">
              {images.length === 0
                ? "Upload images or a folder to populate your CDN & local SQLite database."
                : "No images match the selected filter or search."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredImages.map((image) => {
              const displayName =
                image.filename || image.public_id.split("/").pop() || "image";
              const targetUrl =
                image.secure_url || image.local_url || image.url;
              const displayRelPath =
                image.relative_path ||
                (image.folder ? `${image.folder}/${displayName}` : displayName);

              return (
                <div
                  key={image.public_id}
                  className="group bg-[#161311] border border-[#2f2923] hover:border-[#d9a55b]/40 rounded-2xl overflow-hidden transition-all duration-200 flex flex-col shadow-md hover:shadow-xl"
                >
                  {/* Thumbnail */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewImage(image)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setPreviewImage(image);
                      }
                    }}
                    className="relative aspect-video bg-[#1e1a16] overflow-hidden cursor-pointer flex items-center justify-center p-2"
                  >
                    <img
                      src={targetUrl}
                      alt={displayName}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Folder Badge Overlay */}
                    {image.folder && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#0e0c0a]/80 backdrop-blur-sm border border-[#2f2923] text-[10px] text-[#d9a55b] flex items-center gap-1.5">
                        <FolderIcon className="w-3 h-3 text-[#d9a55b]" />
                        <span className="truncate max-w-[120px]">
                          {image.folder}
                        </span>
                      </div>
                    )}

                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#0e0c0a]/80 text-[10px] text-[#8e8374] font-mono uppercase">
                      {image.format}
                    </div>
                  </div>

                  {/* Metadata & Actions */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <p
                        className="text-xs font-semibold text-[#f3ebdd] truncate"
                        title={displayName}
                      >
                        {displayName}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[#8e8374]">
                        {image.width > 0 && image.height > 0 && (
                          <>
                            <span>
                              {image.width}×{image.height}
                            </span>
                            <span>·</span>
                          </>
                        )}
                        <span>{formatBytes(image.bytes)}</span>
                      </div>
                    </div>

                    {/* Preserved Relative Path Badge */}
                    <div className="flex items-center justify-between text-[11px] bg-[#1e1a16] border border-[#2f2923] rounded-lg px-2.5 py-1 text-[#8e8374]">
                      <div
                        className="flex items-center gap-1.5 truncate max-w-[180px]"
                        title={displayRelPath}
                      >
                        <FolderIcon className="w-3.5 h-3.5 text-[#d9a55b] shrink-0" />
                        <span className="truncate font-mono">
                          {displayRelPath}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyLink(displayRelPath, `path-${image.public_id}`)
                        }
                        className="hover:text-[#f3ebdd] transition-colors text-[10px] uppercase font-mono ml-2 shrink-0 cursor-pointer"
                        title="Copy relative path"
                      >
                        {copiedId === `path-${image.public_id}`
                          ? "Copied"
                          : "Path"}
                      </button>
                    </div>

                    {/* URL Snippet */}
                    <div className="bg-[#1e1a16] border border-[#2f2923] rounded-lg px-2.5 py-1.5">
                      <p className="text-[11px] text-[#8e8374] truncate font-mono select-all">
                        {targetUrl}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => copyLink(targetUrl, image.public_id)}
                        className={`flex-1 text-xs py-2 px-2.5 rounded-xl font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          copiedId === image.public_id
                            ? "bg-[#4caf7d]/20 text-[#4caf7d] border border-[#4caf7d]/40"
                            : "bg-[#d9a55b]/10 text-[#d9a55b] hover:bg-[#d9a55b]/20 border border-[#d9a55b]/20"
                        }`}
                      >
                        {copiedId === image.public_id ? (
                          <>
                            <svg
                              className="w-3.5 h-3.5 text-[#4caf7d]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                              />
                            </svg>
                            <span>Copy CDN</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => window.open(targetUrl, "_blank")}
                        className="text-xs p-2 rounded-xl bg-[#1e1a16] hover:bg-[#27221c] text-[#b9ae9d] hover:text-[#f3ebdd] border border-[#2f2923] transition-colors cursor-pointer"
                        title="Open full size in new tab"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteImage(image.public_id)}
                        disabled={deletingId === image.public_id}
                        className="text-xs p-2 rounded-xl bg-[#e06060]/10 hover:bg-[#e06060]/20 text-[#e06060] border border-[#e06060]/20 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Delete asset"
                      >
                        {deletingId === image.public_id ? (
                          <svg
                            className="w-3.5 h-3.5 animate-spin text-[#e06060]"
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
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-[#0e0c0a]/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            role="document"
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full bg-[#161311] border border-[#2f2923] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="p-4 border-b border-[#2f2923] flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#f3ebdd] truncate">
                  {previewImage.filename || previewImage.public_id}
                </p>
                {(previewImage.relative_path || previewImage.folder) && (
                  <p className="text-xs text-[#d9a55b] flex items-center gap-1.5 mt-0.5">
                    <FolderIcon className="w-3.5 h-3.5 text-[#d9a55b]" />
                    <span>
                      {previewImage.relative_path || previewImage.folder}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                aria-label="Close preview"
                className="w-8 h-8 rounded-lg bg-[#1e1a16] text-[#b9ae9d] hover:text-[#f3ebdd] flex items-center justify-center border border-[#2f2923] cursor-pointer transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 bg-[#0e0c0a] flex items-center justify-center overflow-auto flex-1">
              <img
                src={
                  previewImage.secure_url ||
                  previewImage.local_url ||
                  previewImage.url
                }
                alt={previewImage.public_id}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>

            <div className="p-4 border-t border-[#2f2923] bg-[#161311] flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[#8e8374]">
                {previewImage.width > 0 &&
                  `${previewImage.width}×${previewImage.height} · `}
                {formatBytes(previewImage.bytes)} ·{" "}
                {previewImage.format.toUpperCase()}
              </span>
              <div className="flex gap-2">
                {previewImage.relative_path && (
                  <button
                    type="button"
                    onClick={() =>
                      copyLink(
                        previewImage.relative_path || "",
                        `modal-path-${previewImage.public_id}`,
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#1e1a16] hover:bg-[#27221c] text-[#b9ae9d] hover:text-[#f3ebdd] border border-[#2f2923]"
                  >
                    {copiedId === `modal-path-${previewImage.public_id}`
                      ? "Copied Path!"
                      : "Copy Path"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    copyLink(
                      previewImage.secure_url ||
                        previewImage.local_url ||
                        previewImage.url,
                      previewImage.public_id,
                    )
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-[#d9a55b] text-[#0e0c0a] font-semibold"
                >
                  {copiedId === previewImage.public_id ? "Copied!" : "Copy URL"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      previewImage.secure_url ||
                        previewImage.local_url ||
                        previewImage.url,
                      "_blank",
                    )
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-[#1e1a16] text-[#f3ebdd] border border-[#2f2923]"
                >
                  Open in New Tab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
