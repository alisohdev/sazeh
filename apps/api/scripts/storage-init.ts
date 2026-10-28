import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createS3Client, storageSettingsFromEnvironment } from "../src/storage/s3.js";

async function main(): Promise<void> {
  const settings = storageSettingsFromEnvironment();
  if (!settings) throw new Error("Complete S3 settings are required");
  const client = createS3Client(settings);
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: settings.bucket }));
      await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
    }
    process.stdout.write(`Private development bucket '${settings.bucket}' is ready.\n`);
  } finally {
    client.destroy();
  }
}

void main();
