import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "verification");

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Invalid file format");
  }

  const mimeType = match[1];
  const base64 = match[2];
  const ext = MIME_TO_EXT[mimeType];

  if (!ext) {
    throw new Error("Unsupported file type");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("File too large (max 5MB)");
  }

  return { buffer, ext };
}

export async function saveVerificationFile({ driverId, docType, dataUrl, originalName }) {
  const { buffer, ext } = parseDataUrl(dataUrl);
  const safeDriverId = String(driverId).replace(/[^a-zA-Z0-9_-]/g, "");
  const safeDocType = String(docType).replace(/[^a-zA-Z0-9_-]/g, "");
  const random = crypto.randomBytes(8).toString("hex");
  const fileName = `${safeDocType}-${Date.now()}-${random}.${ext}`;

  const dir = path.join(UPLOAD_ROOT, safeDriverId);
  await fs.mkdir(dir, { recursive: true });

  const absolutePath = path.join(dir, fileName);
  await fs.writeFile(absolutePath, buffer);

  const publicUrl = `/uploads/verification/${safeDriverId}/${fileName}`;

  return {
    fileName: originalName || fileName,
    storedFileName: fileName,
    url: publicUrl,
  };
}
