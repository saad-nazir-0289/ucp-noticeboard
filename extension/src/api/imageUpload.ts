/**
 * Uploads an image straight from the browser to Cloudinary's free tier,
 * bypassing your own backend entirely — no Railway bandwidth or storage
 * cost, no code on the server side at all.
 *
 * One-time setup required (see README):
 *   1. Free account at cloudinary.com (no card needed).
 *   2. Note your Cloud Name from the dashboard.
 *   3. Settings → Upload → add an Upload Preset, set it to "Unsigned".
 * Fill in both values below.
 */
const CLOUDINARY_CLOUD_NAME = "yehmyd3g";
const CLOUDINARY_UPLOAD_PRESET = "noticeImages";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a poster image, keeps free-tier usage sane

export class ImageUploadError extends Error { }

export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageUploadError("Please choose an image file.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ImageUploadError("Image is too large — please choose one under 8MB.");
  }
  if (CLOUDINARY_CLOUD_NAME.startsWith("REPLACE_WITH")) {
    throw new ImageUploadError(
      "Image upload isn't configured yet — see imageUpload.ts for one-time setup steps."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    throw new ImageUploadError("Upload failed — please try again.");
  }

  const data = await response.json();
  return data.secure_url as string;
}
