# Image Upload & Asset Observatory

High-performance digital asset management, directory hierarchy preservation, and CDN distribution utility built with Next.js 16, React 19, Tailwind CSS v4, and SQLite.

---

## Overview

Image Upload & Asset Observatory is designed to manage, index, and distribute digital images across local and cloud environments. It provides full folder drag-and-drop capabilities, preserves recursive directory structures, indexes metadata in SQLite, and synchronizes assets with Cloudinary CDN.

The system is optimized for both traditional server environments and serverless architectures (such as Vercel and AWS Lambda), featuring automatic fallback mechanisms for read-only serverless filesystems.

---

## Key Features

- **Directory Hierarchy Preservation**: Drag and drop entire folders or select directories via the native folder picker. Relative paths are parsed and preserved identically across local disk, SQLite tables, and Cloudinary folder paths.
- **Dual-Layer Storage Architecture**: Assets are archived to disk and indexed in SQLite, while simultaneously uploaded to Cloudinary CDN for optimized global edge delivery.
- **Fast Hierarchical Search & Filtering**: Query assets by directory path, subfolder scope, filename, or format with instant recursive breadcrumb navigation.
- **Serverless & Container Resilient**: Automatically switches SQLite and disk writes to temporary storage (`os.tmpdir()`) or in-memory tables when deployed in read-only serverless runtimes.
- **Strict Environment Authentication**: All routes and mutations are protected by Next.js middleware. Authentication strictly validates against server-configured credentials, preventing hardcoded or default access.
- **Enterprise Design System**: High-density Observatory theme featuring an ambient warm zinc dark palette (`#0e0c0a`, `#161311`, `#d9a55b`) with pure SVG vector icons and zero emoji dependencies.

---

## Technical Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI Library**: React 19
- **Styling**: Tailwind CSS v4
- **Database**: Node.js Native SQLite (`node:sqlite` DatabaseSync)
- **CDN Integration**: Cloudinary v2 SDK
- **Code Quality**: Biome

---

## Architecture

```
Image-Upload/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── delete/route.ts      # Deletes records from SQLite and Cloudinary
│   │   │   ├── images/route.ts      # Queries SQLite with Cloudinary direct fallback
│   │   │   ├── login/route.ts       # Validates credentials against environment variables
│   │   │   ├── logout/route.ts      # Clears authentication cookies
│   │   │   └── upload/route.ts      # Handles multipart uploads and folder hierarchies
│   │   ├── login/page.tsx           # Authentication login portal
│   │   ├── uploads/[...path]/       # Dynamic streaming route for local asset delivery
│   │   ├── globals.css              # Global styles and Tailwind configuration
│   │   ├── layout.tsx               # Root application layout
│   │   └── page.tsx                 # Main Observatory dashboard & upload interface
│   ├── lib/
│   │   ├── cloudinary.ts            # Cloudinary client initialization
│   │   └── db.ts                    # SQLite connection, schema, and query abstractions
│   ├── types/
│   │   └── sqlite.d.ts              # TypeScript definitions for node:sqlite
│   └── middleware.ts                # Route protection and authentication barrier
├── scripts/
│   ├── test-folder-upload.mjs       # Automated SQLite schema and hierarchy validation test
│   └── upload-local-folder.mjs      # CLI utility to recursively batch upload local directories
├── sample.env                       # Template environment configuration file
├── .env.example                     # Environment configuration reference
└── package.json
```

---

## Environment Configuration

Copy `sample.env` to `.env.local` for local development:

```bash
cp sample.env .env.local
```

### Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `AUTH_USERNAME` | Yes | Authorized username for administrative access |
| `AUTH_PASSWORD` | Yes | Authorized password for administrative access |
| `CLOUDINARY_URL` | Optional | Full Cloudinary connection string (`cloudinary://key:secret@cloud`) |
| `CLOUDINARY_CLOUD_NAME` | Optional | Alternative Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Optional | Alternative Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Optional | Alternative Cloudinary API secret |
| `DISABLE_AUTH` | Optional | Set to `"true"` to bypass authentication (default: `"false"`) |

---

## Getting Started

### Prerequisites

- Node.js 22.0.0 or higher
- pnpm (recommended), npm, or yarn

### Installation

```bash
git clone https://github.com/MishraShardendu22/Image-Upload.git
cd Image-Upload
pnpm install
```

### Development Server

Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

Create an optimized production build:

```bash
pnpm build
pnpm start
```

### Code Formatting & Linting

Run automated checks using Biome:

```bash
pnpm lint
pnpm format
```

---

## Batch Folder Upload via CLI

You can batch upload an entire local directory directly from the command line:

```bash
node scripts/upload-local-folder.mjs /path/to/local/folder RootPrefix
```

Example:

```bash
node scripts/upload-local-folder.mjs ../Design Design
```

---

## API Reference

### Authentication

- **`POST /api/login`**: Authenticates credentials against `AUTH_USERNAME` and `AUTH_PASSWORD`. Sets an HTTP-only session cookie upon success.
- **`POST /api/logout`**: Invalidates the session cookie.

### Assets Management

- **`GET /api/images`**: Lists indexed images. Supports `?folder=<path>` and `?search=<query>` query parameters.
- **`POST /api/upload`**: Multipart form upload accepting `file`, `folder`, and `relativePath`.
- **`POST /api/delete`**: Deletes an asset by `public_id` from both SQLite and Cloudinary.

---

## License

This project is private and proprietary.
