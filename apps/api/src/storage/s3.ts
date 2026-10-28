import { S3Client } from "@aws-sdk/client-s3";

export type StorageSettings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export function storageSettingsFromEnvironment(): StorageSettings | undefined {
  const values = [
    process.env.S3_ENDPOINT,
    process.env.S3_REGION,
    process.env.S3_BUCKET,
    process.env.S3_ACCESS_KEY_ID,
    process.env.S3_SECRET_ACCESS_KEY,
  ];
  if (values.every((value) => !value)) return undefined;
  if (values.some((value) => !value)) throw new Error("S3 configuration must be complete");
  return {
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION!,
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

export function createS3Client(settings: StorageSettings): S3Client {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
}
