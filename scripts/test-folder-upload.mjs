import assert from "node:assert";
import {
  deleteImageRecord,
  ensureFolderHierarchy,
  getFolderTree,
  getImageByPublicId,
  listFolders,
  listImages,
  saveImageRecord,
} from "../src/lib/db.ts";

console.log("=== Testing SQLite Database & Folder Hierarchy ===");

// 1. Ensure folder hierarchy works
ensureFolderHierarchy("Projects/2026/Q1/Branding");

const folders = listFolders();
console.log("Registered folders:", folders);

const paths = folders.map((f) => f.path);
assert(paths.includes("Projects"), "Projects root folder must exist");
assert(paths.includes("Projects/2026"), "Projects/2026 folder must exist");
assert(
  paths.includes("Projects/2026/Q1"),
  "Projects/2026/Q1 folder must exist",
);
assert(
  paths.includes("Projects/2026/Q1/Branding"),
  "Projects/2026/Q1/Branding folder must exist",
);
console.log("✓ ensureFolderHierarchy passed");

// 2. Test tree building
const tree = getFolderTree();
console.log("Folder tree structure:", JSON.stringify(tree, null, 2));
const projectsRoot = tree.find((n) => n.name === "Projects");
assert(projectsRoot, "Root node 'Projects' should exist in tree");
assert(
  projectsRoot.children.some((c) => c.name === "2026"),
  "Child '2026' should exist",
);
console.log("✓ getFolderTree passed");

// 3. Test image saving & listing
const testPublicId = "test/Projects/2026/Q1/Branding/logo";
saveImageRecord({
  public_id: testPublicId,
  filename: "logo.png",
  relative_path: "Projects/2026/Q1/Branding/logo.png",
  folder_path: "Projects/2026/Q1/Branding",
  local_url: "/uploads/Projects/2026/Q1/Branding/logo.png",
  secure_url: "/uploads/Projects/2026/Q1/Branding/logo.png",
  width: 800,
  height: 600,
  format: "png",
  bytes: 12345,
  created_at: new Date().toISOString(),
});

const found = getImageByPublicId(testPublicId);
assert(found, "Image record should be found by public_id");
assert.strictEqual(found.filename, "logo.png");
assert.strictEqual(found.folder_path, "Projects/2026/Q1/Branding");
assert.strictEqual(found.relative_path, "Projects/2026/Q1/Branding/logo.png");
console.log("✓ saveImageRecord & getImageByPublicId passed");

// 4. Test listImages with folder filtering
const inFolder = listImages({ folder: "Projects/2026" });
assert(
  inFolder.some((img) => img.public_id === testPublicId),
  "Image should be returned when querying ancestor folder",
);
console.log("✓ listImages ancestor query passed");

// 5. Test search query
const searchResults = listImages({ search: "Branding" });
assert(
  searchResults.some((img) => img.public_id === testPublicId),
  "Image should be returned when searching for term",
);
console.log("✓ listImages search passed");

// 6. Test delete
const deleted = deleteImageRecord(testPublicId);
assert(deleted, "deleteImageRecord should return true");
const afterDelete = getImageByPublicId(testPublicId);
assert.strictEqual(afterDelete, null, "Image should be null after delete");
console.log("✓ deleteImageRecord passed");

console.log("\nALL SQLITE & FOLDER TESTS PASSED SUCCESSFULLY! 🎉\n");
