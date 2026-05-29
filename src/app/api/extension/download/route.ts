import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import JSZip from "jszip";

export const dynamic = "force-dynamic";

const EXTENSION_DIR = join(process.cwd(), "chrome-extension");

// Files/dirs to exclude from the zip
const EXCLUDE = new Set(["README.md", ".DS_Store", "Thumbs.db"]);

async function addDirToZip(zip: JSZip, dirPath: string, zipPath: string) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE.has(entry.name)) continue;
    const fullPath = join(dirPath, entry.name);
    const zipEntry = zipPath ? `${zipPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDirToZip(zip, fullPath, zipEntry);
    } else {
      const content = await readFile(fullPath);
      zip.file(zipEntry, content);
    }
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const zip = new JSZip();
    await addDirToZip(zip, EXTENSION_DIR, "");

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="skalle-extension.zip"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de générer le zip" },
      { status: 500 }
    );
  }
}
