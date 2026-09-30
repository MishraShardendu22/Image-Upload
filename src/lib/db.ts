import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface FolderRecord {
  id?: number;
  path: string;
  name: string;
  parent_path: string | null;
  created_at: string;
  image_count?: number;
}

export interface ImageRecord {
  id?: number;
  public_id: string;
  filename: string;
  relative_path: string;
  folder_path: string;
  local_url: string;
  secure_url: string;
  width?: number;
  height?: number;
  format: string;
  bytes: number;
  created_at: string;
}

export interface FolderNode {
  path: string;
  name: string;
  imageCount: number;
  children: FolderNode[];
}

let dbInstance: DatabaseSync | null = null;

function getDataDir(): string {
  // In serverless environments like Vercel or AWS Lambda, process.cwd() is read-only.
  // Use os.tmpdir() for writable storage.
  const isServerless = Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.TMPDIR,
  );

  if (isServerless) {
    return path.join(os.tmpdir(), "image-upload-data");
  }

  // In local development, check if process.cwd()/data is writable
  try {
    const localDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    return path.join(os.tmpdir(), "image-upload-data");
  }
}

function initSchema(db: DatabaseSync): void {
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // Some in-memory SQLite environments do not support WAL mode
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      parent_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      local_url TEXT NOT NULL,
      secure_url TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      format TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder_path);
    CREATE INDEX IF NOT EXISTS idx_images_relative ON images(relative_path);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_path);
  `);
}

export function getDb(): DatabaseSync | null {
  if (dbInstance) return dbInstance;

  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, "images.db");
    const db = new DatabaseSync(dbPath);
    initSchema(db);
    dbInstance = db;
    return db;
  } catch (diskErr) {
    console.warn(
      "Failed to initialize SQLite on disk, falling back to in-memory:",
      diskErr,
    );
    try {
      const memoryDb = new DatabaseSync(":memory:");
      initSchema(memoryDb);
      dbInstance = memoryDb;
      return memoryDb;
    } catch (memErr) {
      console.error(
        "Critical: Could not initialize SQLite DatabaseSync:",
        memErr,
      );
      return null;
    }
  }
}

/** Ensure a folder and all its parent directories exist in the folders table */
export function ensureFolderHierarchy(folderPath: string): void {
  const clean = folderPath
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();

  if (!clean) return;

  const db = getDb();
  if (!db) return;

  const parts = clean.split("/").filter(Boolean);

  let currentPath = "";
  let parentPath: string | null = null;

  try {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO folders (path, name, parent_path, created_at)
      VALUES (?, ?, ?, ?);
    `);

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const now = new Date().toISOString();
      insertStmt.run(currentPath, part, parentPath, now);
      parentPath = currentPath;
    }
  } catch (err) {
    console.warn("Failed to ensure folder hierarchy:", err);
  }
}

/** Insert or update an image record and its parent folder */
export function saveImageRecord(img: ImageRecord): void {
  const db = getDb();
  if (!db) return;

  if (img.folder_path) {
    ensureFolderHierarchy(img.folder_path);
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO images (
        public_id, filename, relative_path, folder_path,
        local_url, secure_url, width, height, format, bytes, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(public_id) DO UPDATE SET
        filename = excluded.filename,
        relative_path = excluded.relative_path,
        folder_path = excluded.folder_path,
        local_url = excluded.local_url,
        secure_url = excluded.secure_url,
        width = excluded.width,
        height = excluded.height,
        format = excluded.format,
        bytes = excluded.bytes,
        created_at = excluded.created_at;
    `);

    stmt.run(
      img.public_id,
      img.filename,
      img.relative_path,
      img.folder_path,
      img.local_url,
      img.secure_url,
      img.width ?? null,
      img.height ?? null,
      img.format,
      img.bytes,
      img.created_at,
    );
  } catch (err) {
    console.warn("Failed to save image record to SQLite:", err);
  }
}

/** Fetch all images with optional folder filtering and search */
export function listImages(options?: {
  folder?: string;
  recursive?: boolean;
  search?: string;
}): ImageRecord[] {
  const db = getDb();
  if (!db) return [];

  const { folder, recursive = true, search } = options || {};

  let query = "SELECT * FROM images WHERE 1=1";
  const params: (string | number)[] = [];

  if (folder && folder !== "all") {
    const cleanFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (recursive) {
      query += " AND (folder_path = ? OR folder_path LIKE ?)";
      params.push(cleanFolder, `${cleanFolder}/%`);
    } else {
      query += " AND folder_path = ?";
      params.push(cleanFolder);
    }
  }

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query +=
      " AND (filename LIKE ? OR relative_path LIKE ? OR folder_path LIKE ?)";
    params.push(term, term, term);
  }

  query += " ORDER BY created_at DESC;";

  try {
    return db.prepare(query).all(...params) as unknown as ImageRecord[];
  } catch (err) {
    console.warn("Failed to list images from SQLite:", err);
    return [];
  }
}

/** Fetch all distinct folders with image counts */
export function listFolders(): { path: string; name: string; count: number }[] {
  const db = getDb();
  if (!db) return [];

  try {
    const stmt = db.prepare(`
      SELECT f.path, f.name, COUNT(i.id) as count
      FROM folders f
      LEFT JOIN images i ON (i.folder_path = f.path OR i.folder_path LIKE f.path || '/%')
      GROUP BY f.path, f.name
      ORDER BY f.path ASC;
    `);

    return stmt.all() as unknown as {
      path: string;
      name: string;
      count: number;
    }[];
  } catch (err) {
    console.warn("Failed to list folders from SQLite:", err);
    return [];
  }
}

/** Build a nested hierarchical folder tree */
export function getFolderTree(): FolderNode[] {
  const folders = listFolders();
  const rootNodes: FolderNode[] = [];
  const nodeMap = new Map<string, FolderNode>();

  for (const f of folders) {
    const node: FolderNode = {
      path: f.path,
      name: f.name,
      imageCount: f.count,
      children: [],
    };
    nodeMap.set(f.path, node);
  }

  for (const f of folders) {
    const node = nodeMap.get(f.path);
    if (!node) continue;
    const lastSlash = f.path.lastIndexOf("/");
    if (lastSlash === -1) {
      rootNodes.push(node);
    } else {
      const parentPath = f.path.substring(0, lastSlash);
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }
  }

  return rootNodes;
}

/** Fetch an image record by publicId */
export function getImageByPublicId(publicId: string): ImageRecord | null {
  const db = getDb();
  if (!db) return null;

  try {
    const row = db
      .prepare("SELECT * FROM images WHERE public_id = ?;")
      .get(publicId);
    return (row as unknown as ImageRecord) || null;
  } catch (err) {
    console.warn("Failed to get image by public ID:", err);
    return null;
  }
}

/** Delete an image record from SQLite */
export function deleteImageRecord(publicId: string): boolean {
  const db = getDb();
  if (!db) return false;

  try {
    const res = db
      .prepare("DELETE FROM images WHERE public_id = ?;")
      .run(publicId);
    return (res.changes ?? 0) > 0;
  } catch (err) {
    console.warn("Failed to delete image record from SQLite:", err);
    return false;
  }
}

/** Total count of assets */
export function getImageCount(): number {
  const db = getDb();
  if (!db) return 0;

  try {
    const row = db.prepare("SELECT COUNT(*) as total FROM images;").get() as {
      total: number;
    };
    return row?.total ?? 0;
  } catch (err) {
    console.warn("Failed to get image count from SQLite:", err);
    return 0;
  }
}
