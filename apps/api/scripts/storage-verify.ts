import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, storageSettingsFromEnvironment } from "../src/storage/s3.js";

async function main(): Promise<void> {
  const settings = storageSettingsFromEnvironment();
  if (!settings) throw new Error("Complete S3 settings are required");
  const client = createS3Client(settings);
  const key = `m0-verification/${randomUUID()}.txt`;
  const expected = `attachment-storage-verification-${randomUUID()}`;
  try {
    await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: expected }));
    const response = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }));
    const actual = await response.Body?.transformToString();
    if (actual !== expected) throw new Error("Object storage returned content that did not match");
    process.stdout.write("S3-compatible attachment storage passed put/get verification.\n");
  } finally {
    await client
      .send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }))
      .catch(() => undefined);
    client.destroy();
  }
}

void main();
