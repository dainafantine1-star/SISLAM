export const MAX_UPLOAD_MB = process.env.NEXT_PUBLIC_HOSTED_DEMO === '1' ? 3 : 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
