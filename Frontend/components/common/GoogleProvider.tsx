"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ReactNode } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export default function GoogleProvider({ children }: { children: ReactNode }) {
  return <GoogleOAuthProvider clientId={CLIENT_ID}>{children}</GoogleOAuthProvider>;
}
