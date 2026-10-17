import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { S3RecoveryStore } from "../../src/recovery-storage.js";

/** Isolated S3 protocol fixture; never an AWS durability claim. */
export async function recoveryStorageFixture() {
  const objects = new Map<
    string,
    { latest: string; versions: Map<string, Buffer> }
  >();
  let unavailable = false;
  const server = createServer(async (req, res) => {
    if (unavailable) {
      res.statusCode = 503;
      res.end("<Error><Code>ServiceUnavailable</Code></Error>");
      return;
    }
    const url = new URL(req.url!, "http://localhost"),
      object = objects.get(url.pathname);
    const etag = (bytes: Buffer) =>
      '"' + createHash("sha256").update(bytes).digest("hex") + '"';
    if (req.method === "PUT") {
      if (
        (req.headers["if-none-match"] === "*" && object) ||
        (req.headers["if-match"] &&
          (!object ||
            req.headers["if-match"] !==
              etag(object.versions.get(object.latest)!)))
      ) {
        res.statusCode = 412;
        res.end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      const bytes = Buffer.concat(parts),
        version = randomUUID();
      const next = object ?? {
        latest: version,
        versions: new Map<string, Buffer>(),
      };
      next.latest = version;
      next.versions.set(version, bytes);
      objects.set(url.pathname, next);
      res.setHeader("ETag", etag(bytes));
      res.setHeader("x-amz-version-id", version);
      res.end();
      return;
    }
    const version = url.searchParams.get("versionId") || object?.latest,
      bytes = version && object?.versions.get(version);
    if (!bytes) {
      res.statusCode = 404;
      res.end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    res.setHeader("ETag", etag(bytes));
    res.setHeader("x-amz-version-id", version!);
    res.setHeader("x-amz-server-side-encryption", "AES256");
    res.setHeader(
      "x-amz-checksum-sha256",
      createHash("sha256").update(bytes).digest("base64"),
    );
    res.setHeader("Content-Length", bytes.length);
    res.end(req.method === "HEAD" ? undefined : bytes);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const client = new S3Client({
    region: "ap-southeast-1",
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: "fictional",
      secretAccessKey: "fictional-secret",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const store = new S3RecoveryStore(
    {
      bucket: "fictional-recovery-bucket",
      region: "ap-southeast-1",
      environment: "test-pilot",
    },
    client,
  );
  return {
    store,
    set unavailable(value: boolean) {
      unavailable = value;
    },
    async close() {
      client.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
