import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Writable, Readable } from "node:stream";
export type RecoveryStorageConfig = {
  bucket: string;
  region: string;
  environment: string;
};
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function fileHash(path: string) {
  const h = createHash("sha256");
  await pipeline(
    createReadStream(path),
    new Writable({
      write(chunk, _enc, done) {
        h.update(chunk);
        done();
      },
    }),
  );
  return h.digest("hex");
}

/** S3 transport only. Keys contain environment/run IDs, never user payloads. */
export class S3RecoveryStore {
  private readonly client: S3Client;
  constructor(
    readonly config: RecoveryStorageConfig,
    client?: S3Client,
  ) {
    if (
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) ||
      !/^ap-[a-z]+-\d$/.test(config.region) ||
      !/^[a-z][a-z0-9-]{2,39}$/.test(config.environment)
    )
      throw new Error("INVALID_RECOVERY_STORAGE_CONFIGURATION");
    this.client =
      client ??
      new S3Client({
        region: config.region,
        maxAttempts: 3,
        requestChecksumCalculation: "WHEN_REQUIRED",
        requestHandler: { requestTimeout: 120000, connectionTimeout: 10000 },
      });
  }
  private key(key: string) {
    if (!/^(ledger|exports)\/[a-zA-Z0-9._-]{1,160}$/.test(key))
      throw new Error("INVALID_RECOVERY_OBJECT_KEY");
    const [prefix, name] = key.split("/");
    return prefix + "/" + this.config.environment + "/" + name;
  }
  async read(key: string, version?: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        ...(version ? { VersionId: version } : {}),
      }),
    );
    if (!response.Body) throw new Error("INDEPENDENT_OBJECT_UNAVAILABLE");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.Body as Readable) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        (response.Body as Readable).destroy();
        throw new Error("RECOVERY_METADATA_TOO_LARGE");
      }
      chunks.push(Buffer.from(chunk));
    }
    return {
      bytes: Buffer.concat(chunks),
      etag: response.ETag,
      version: response.VersionId,
    };
  }
  async put(
    key: string,
    bytes: Buffer,
    condition?: { etag?: string; absent?: boolean },
  ) {
    const digest = hash(bytes);
    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        Body: bytes,
        ServerSideEncryption: "AES256",
        ChecksumSHA256: Buffer.from(digest, "hex").toString("base64"),
        ...(condition?.etag ? { IfMatch: condition.etag } : {}),
        ...(condition?.absent ? { IfNoneMatch: "*" } : {}),
      }),
    );
    if (!response.VersionId)
      throw new Error("VERSIONED_RECOVERY_BUCKET_REQUIRED");
    const copy = await this.read(key, response.VersionId);
    if (hash(copy.bytes) !== digest)
      throw new Error("INDEPENDENT_COPY_VERIFICATION_FAILED");
    return { version: response.VersionId, etag: response.ETag, sha256: digest };
  }
  async putArchive(key: string, path: string) {
    const info = await stat(path);
    if (!info.isFile() || info.size >= 5 * 1024 ** 3)
      throw new Error("BACKUP_MULTIPART_REQUIRED_ABOVE_5_GIB");
    const digest = await fileHash(path);
    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        Body: createReadStream(path),
        ContentLength: info.size,
        ServerSideEncryption: "AES256",
        ChecksumSHA256: Buffer.from(digest, "hex").toString("base64"),
        IfNoneMatch: "*",
      }),
    );
    if (!response.VersionId)
      throw new Error("VERSIONED_RECOVERY_BUCKET_REQUIRED");
    const copy = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        VersionId: response.VersionId,
      }),
    );
    if (!copy.Body) throw new Error("INDEPENDENT_OBJECT_UNAVAILABLE");
    const h = createHash("sha256");
    await pipeline(
      copy.Body as Readable,
      new Writable({
        write(chunk, _enc, done) {
          h.update(chunk);
          done();
        },
      }),
    );
    if (h.digest("hex") !== digest)
      throw new Error("INDEPENDENT_COPY_VERIFICATION_FAILED");
    return { version: response.VersionId, sha256: digest };
  }
  async downloadArchive(key: string, version: string, path: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        VersionId: version,
      }),
    );
    if (!response.Body || !version)
      throw new Error("VERSIONED_RECOVERY_OBJECT_REQUIRED");
    let created = false;
    const output = createWriteStream(path, { flags: "wx", mode: 0o600 });
    output.once("open", () => {
      created = true;
    });
    try {
      await pipeline(response.Body as Readable, output);
    } catch (error) {
      if (created) await unlink(path).catch(() => {});
      throw error;
    }
  }
  async latestBackup() {
    const marker = JSON.parse(
      (await this.read("exports/latest.json")).bytes.toString("utf8"),
    );
    if (
      !/^[a-f0-9-]{36}$/.test(marker.id) ||
      typeof marker.remote_version !== "string" ||
      !/^[a-f0-9]{64}$/.test(marker.archive_sha256) ||
      marker.environment !== this.config.environment ||
      !Number.isFinite(Date.parse(marker.snapshot_at)) ||
      !Number.isFinite(Date.parse(marker.verified_at))
    )
      throw new Error("INVALID_INDEPENDENT_BACKUP_RECEIPT");
    const object = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key("exports/" + marker.id + ".enc"),
        VersionId: marker.remote_version,
        ChecksumMode: "ENABLED",
      }),
    );
    if (
      object.ChecksumSHA256 !==
        Buffer.from(marker.archive_sha256, "hex").toString("base64") ||
      object.ServerSideEncryption !== "AES256" ||
      !object.ContentLength
    )
      throw new Error("INDEPENDENT_BACKUP_VERSION_UNVERIFIED");
    return marker as {
      id: string;
      environment: string;
      snapshot_at: string;
      verified_at: string;
      archive_sha256: string;
      remote_version: string;
    };
  }
  destroy() {
    this.client.destroy();
  }
}
