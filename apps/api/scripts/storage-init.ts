import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
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
    const origin = process.env.AUTH_ALLOWED_ORIGIN;
    if (origin)
      await client.send(
        new PutBucketCorsCommand({
          Bucket: settings.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins:
                  process.env.APP_ENV === "local" ? [origin, "http://127.0.0.1:4173"] : [origin],
                AllowedMethods: ["PUT", "GET", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 120,
              },
            ],
          },
        }),
      );
    process.stdout.write(`Private development bucket '${settings.bucket}' is ready.\n`);
  } finally {
    client.destroy();
  }
}

void main();
