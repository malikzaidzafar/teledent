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
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSuccess(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      setError("No credential returned by Google.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential, role);
      // navigation happens inside loginWithGoogle — keep spinner up until unmount
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <>
      {/* Full-screen loading overlay while Google auth + redirect are in progress */}
      {loading && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          animation: "fadeIn 0.3s ease-out forwards"
        }}>
          {/* Logo container with pulse effect */}
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute",
              inset: -12,
              background: "var(--brand-blue-light)",
              borderRadius: "50%",
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
            }} />
            <div style={{ 
              position: "relative",
              width: 56, 
              height: 56, 
              background: "var(--brand-blue)", 
              borderRadius: 14, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(19, 91, 236, 0.3)"
            }}>
              {/* Simple tooth/medical icon representation */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4c-3-1.5-6 0-6 4 0 3 2 4 4 7 0 2 1.5 3 2 3s2-1 2-3c2-3 4-4 4-7 0-4-3-5.5-6-4z" />
                <path d="M12 18v3" />
              </svg>
            </div>
          </div>
          
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
              Teledent<span style={{ color: "var(--brand-blue)" }}>AI</span>
            </span>
            
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              {/* Small spinner */}
              <div style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "3px solid var(--border)",
                borderTopColor: "var(--brand-blue)",
                animation: "spin 0.75s linear infinite",
              }} />
              <div style={{ color: "var(--text-secondary)", fontSize: 16, fontWeight: 500 }}>
                Preparing your portal...
              </div>
            </div>
          </div>
          
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pulse { 
              0%, 100% { opacity: 1; transform: scale(1); } 
              50% { opacity: 0.5; transform: scale(1.4); } 
            }
          `}</style>
        </div>
      )}

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
    </>
  );
}
