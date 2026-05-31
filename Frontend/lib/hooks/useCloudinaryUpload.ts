"use client";
/**
 * lib/hooks/useCloudinaryUpload.ts
 * Gets signed params from backend, then uploads directly to Cloudinary.
 * Returns the cloudinary_url and public_id to store in the DB via /scans.
 */
import { useState } from "react";
import { filesApi, type SignedUploadResponse } from "../api";

interface UploadResult {
  secure_url: string;
  public_id: string;
}

export function useCloudinaryUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, folder = "scans"): Promise<UploadResult> => {
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Step 1: Get signed params from our backend
      const signed: SignedUploadResponse = await filesApi.signUpload(file.name, file.type, folder);

      // Step 2: Upload directly to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signed.api_key);
      formData.append("timestamp", String(signed.timestamp));
      formData.append("signature", signed.signature);
      formData.append("folder", signed.folder);
      if (signed.public_id) formData.append("public_id", signed.public_id);

      const res = await fetch(signed.cloudinary_url, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Cloudinary upload failed");
      const result = await res.json();
      setProgress(100);
      return { secure_url: result.secure_url, public_id: result.public_id };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      throw new Error(msg);
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, progress, error };
}
