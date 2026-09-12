import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredMedia {
  key: string;
  publicUrl: string;
}

export interface MediaStorage {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredMedia>;
}

function repoRoot(): string {
  const configured = process.env.COGNA_REPO_ROOT?.trim();
  if (configured) return configured;
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}apps${path.sep}web`) || cwd.endsWith(`${path.sep}apps${path.sep}api`)) {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

export function defaultMediaRoot(): string {
  return process.env.COGNA_MEDIA_LOCAL_DIR?.trim() || path.join(repoRoot(), "generated-media");
}

export function defaultPublicBaseUrl(): string {
  return (
    process.env.COGNA_MEDIA_PUBLIC_BASE_URL?.trim() ||
    process.env.COGNA_MEDIA_CDN_URL?.trim() ||
    "http://localhost:3000/generated-media"
  );
}

function safeKey(key: string): string {
  const normalized = key
    .replace(/^\/+/, "")
    .split(/[\\/]+/)
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!normalized) throw new Error("Invalid media key.");
  return normalized;
}

export class LocalDiskMediaStorage implements MediaStorage {
  constructor(
    private readonly rootDir = defaultMediaRoot(),
    private readonly publicBaseUrl = defaultPublicBaseUrl(),
  ) {}

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredMedia> {
    const key = safeKey(input.key);
    const absolute = path.join(this.rootDir, key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.body);
    const publicUrl = `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    return { key, publicUrl };
  }
}

export class S3MediaStorage implements MediaStorage {
  constructor(
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
    private readonly region = process.env.AWS_REGION?.trim() || "ap-south-1",
  ) {}

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<StoredMedia> {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ region: this.region });
    const key = safeKey(input.key);
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    const base = this.publicBaseUrl.replace(/\/$/, "");
    return { key, publicUrl: `${base}/${key}` };
  }
}

export function createMediaStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MediaStorage {
  const bucket = env.COGNA_MEDIA_STORAGE_BUCKET?.trim();
  const cdn = env.COGNA_MEDIA_CDN_URL?.trim() || env.COGNA_MEDIA_PUBLIC_BASE_URL?.trim();
  if (bucket) {
    if (!cdn) {
      throw new Error("COGNA_MEDIA_CDN_URL (or COGNA_MEDIA_PUBLIC_BASE_URL) is required with object storage.");
    }
    return new S3MediaStorage(bucket, cdn, env.AWS_REGION?.trim() || "ap-south-1");
  }
  return new LocalDiskMediaStorage(
    env.COGNA_MEDIA_LOCAL_DIR?.trim() || defaultMediaRoot(),
    env.COGNA_MEDIA_PUBLIC_BASE_URL?.trim() || env.COGNA_MEDIA_CDN_URL?.trim() || defaultPublicBaseUrl(),
  );
}
