"use client";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

interface Props {
  /** Sent to the backend when creating a brand-new account via Google */
  role?: string;
}

export default function GoogleSignInButton({ role }: Props) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleSuccess(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      setError("No credential returned by Google.");
      return;
    }
    setError(null);
    try {
      await loginWithGoogle(credentialResponse.credential, role);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => setError("Google sign-in was cancelled or failed.")}
        width="400"
        text="continue_with"
        shape="rectangular"
        logo_alignment="left"
      />
      {error && (
        <p style={{ color: "#dc2626", fontSize: 13, margin: 0, textAlign: "center" }}>{error}</p>
      )}
    </div>
  );
}
