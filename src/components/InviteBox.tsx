"use client";
import { useState } from "react";
import { APP_NAME } from "@/lib/brand";

export default function InviteBox({ url, expiresAt }: { url: string; expiresAt: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: APP_NAME, text: "I made us a private space.", url });
    } catch { /* closed the share sheet */ }
  }

  return (
    <div className="invite">
      <p className="invite__url">{url}</p>
      <div className="row">
        <button type="button" className="btn btn--ghost" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        {canShare && <button type="button" className="btn" onClick={share}>Share link</button>}
      </div>
      <p className="hint">
        Works once and expires {new Date(expiresAt).toLocaleDateString([], { day: "numeric", month: "long" })}.
        Tell her the password in person or on a call, never in the same message as the link.
      </p>
    </div>
  );
}
