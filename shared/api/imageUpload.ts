import { API_BASE_URL } from "./client";

/**
 * Uploads an image straight from the browser to Cloudinary — bypassing
 * your own backend for the actual image bytes, so it costs zero Railway
 * bandwidth. Uses a SIGNED upload, not an unsigned preset: the backend
 * (Publisher/Admin-only) hands out a short-lived signature per upload,
 * so nobody who isn't an authenticated Publisher/Admin of this app can
 * ever use your Cloudinary account, even if they find your Cloud Name
 * sitting in the extension's published code (which is unavoidable and
 * harmless — it's not a secret, it's just an address).
 *
 * One-time setup required (see README):
 *   1. Free account at cloudinary.com (no card needed).
 *   2. From the dashboard, copy Cloud Name, API Key, and API Secret.
 *   3. Set these on the BACKEND only — Railway env vars
 *      Cloudinary__CloudName, Cloudinary__ApiKey, Cloudinary__ApiSecret
 *      (or appsettings.json locally). Never put the API Secret anywhere
 *      in the extension's code.
 */

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a poster image, keeps free-tier usage sane

export class ImageUploadError extends Error {}

interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
}

async function getUploadSignature(token: string): Promise<UploadSignature> {
  const response = await fetch(`${API_BASE_URL}/uploads/signature`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 503) {
    throw new ImageUploadError("Image uploads are not set up yet. Please contact the Admin.");
  }
  if (!response.ok) {
    throw new ImageUploadError("Could not start the upload. Please try again.");
  }

  return response.json();
}

export async function uploadImage(file: File, token: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageUploadError("Please choose an image file.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ImageUploadError("This image is too large. Please choose one under 8 MB.");
  }

  const { signature, timestamp, apiKey, cloudName } = await getUploadSignature(token);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new ImageUploadError("Upload failed. Please try again.");
  }

  const data = await response.json();
  return data.secure_url as string;
}
