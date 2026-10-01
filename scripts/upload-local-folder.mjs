#!/usr/bin/env node

/**
 * Script to batch upload a local folder preserving directory hierarchy to Cloudinary.
 *
 * Usage:
 *   node scripts/upload-local-folder.mjs [folderPath] [rootPrefix]
 *
 * Example:
 *   node scripts/upload-local-folder.mjs /home/ms22/Coding_stuff/Personal-Projects/Design Design
 */

import fs from "node:fs";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";

const targetDir =
  process.argv[2] || "/home/ms22/Coding_stuff/Personal-Projects/Design";
const rootPrefix = process.argv[3] || path.basename(targetDir);

if (!fs.existsSync(targetDir)) {
  console.error(`Error: Directory not found: ${targetDir}`);
  process.exit(1);
}

if (!process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_API_KEY) {
  console.warn(`\n[NOTE] CLOUDINARY_URL is not set in local environment.`);
  console.warn(`To use this CLI script locally, provide your Cloudinary URL:`);
  console.warn(
    `  CLOUDINARY_URL="cloudinary://<key>:<secret>@<cloud>" node scripts/upload-local-folder.mjs`,
  );
  console.warn(
    `Alternatively, you can drag-and-drop the Design folder directly into the deployed web UI at https://image-upload-eta-six.vercel.app/ !\n`,
  );
}

cloudinary.config(true);

const VALID_EXTENSIONS = new Set([
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
]);

function getFilesRecursively(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({ fullPath, relativePath, name: entry.name, ext });
      }
    }
  }

  return files;
}

async function uploadFile(item, index, total) {
  const dirName = path.dirname(item.relativePath);
  const subfolder = dirName === "." ? "" : dirName;
  const targetFolder = subfolder
    ? `image-upload-app/${rootPrefix}/${subfolder}`.replace(/\/+/g, "/")
    : `image-upload-app/${rootPrefix}`.replace(/\/+/g, "/");

  const progress = `[${index + 1}/${total}]`;
  process.stdout.write(
    `${progress} Uploading ${rootPrefix}/${item.relativePath} ... `,
  );

  try {
    const result = await cloudinary.uploader.upload(item.fullPath, {
      folder: targetFolder,
      resource_type: "auto",
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    });

    console.log(`[OK] DONE`);
    console.log(`   CDN: ${result.secure_url}`);
    return { success: true, item, result };
  } catch (error) {
    console.log(`[ERROR] FAILED: ${error.message}`);
    return { success: false, item, error };
  }
}

async function main() {
  console.log(`\n========================================`);
  console.log(` Observatory Asset Batch Upload Utility`);
  console.log(`========================================`);
  console.log(`Target Directory: ${targetDir}`);
  console.log(`Root Prefix:      ${rootPrefix}`);
  console.log(`\nScanning directory for valid image files...`);

  const files = getFilesRecursively(targetDir);
  console.log(`Found ${files.length} images to upload.\n`);

  if (files.length === 0) {
    console.log("No valid image files found.");
    return;
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const res = await uploadFile(files[i], i, files.length);
    results.push(res);
  }

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n========================================`);
  console.log(` Upload Summary`);
  console.log(`========================================`);
  console.log(`Total Scanned: ${files.length}`);
  console.log(`Succeeded:     ${succeeded.length}`);
  console.log(`Failed:        ${failed.length}`);

  if (succeeded.length > 0) {
    console.log(`\nUploaded Folders:`);
    const folders = new Set(
      succeeded.map((s) => path.dirname(s.item.relativePath)),
    );
    for (const f of folders) {
      console.log(` - ${rootPrefix}/${f === "." ? "" : f}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
