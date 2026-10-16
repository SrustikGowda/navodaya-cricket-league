import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "./errors";
import { supabaseStorageConfigured } from "./integrations";

const MAX_BYTES = 2_000_000;

export function sniffImage(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function saveImage(bucket: "public" | "private", bytes: Buffer): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new DomainError("Images must be smaller than 2 MB.");
  const type = sniffImage(bytes);
  if (!type) throw new DomainError("Upload a PNG, JPEG or WebP image.");
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const filename = `${crypto.randomUUID()}.${extension}`;
  if (supabaseStorageConfigured()) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });
    const bucketName = bucket === "public" ? process.env.SUPABASE_STORAGE_BUCKET_PUBLIC ?? "" : process.env.SUPABASE_STORAGE_BUCKET_PRIVATE ?? "";
    const { error } = await client.storage.from(bucketName).upload(filename, bytes, { contentType: type, upsert: false });
    if (error) throw new DomainError("The file could not be stored. Nothing else was changed.");
    return `supabase:${bucket}:${filename}`;
  }
  const directory = path.join(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || ".data/uploads", bucket);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ directory, filename), bytes);
  return `local:${bucket}:${filename}`;
}

export async function readStoredFile(storedPath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const [scheme, bucket, filename] = storedPath.split(":");
  if (!filename || !["public", "private"].includes(bucket ?? "")) return null;
  if (scheme === "supabase" && supabaseStorageConfigured()) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });
    const bucketName = bucket === "public" ? process.env.SUPABASE_STORAGE_BUCKET_PUBLIC ?? "" : process.env.SUPABASE_STORAGE_BUCKET_PRIVATE ?? "";
    const { data, error } = await client.storage.from(bucketName).download(filename);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return { bytes, contentType: sniffImage(bytes) ?? "application/octet-stream" };
  }
  if (scheme !== "local") return null;
  const safe = path.basename(filename);
  const file = path.join(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || ".data/uploads", bucket ?? "", safe);
  try {
    const bytes = await readFile(file);
    return { bytes, contentType: sniffImage(bytes) ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export function safeUploadName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "image";
}
