"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A blank step between two spaces, so the chat screen starts completely fresh for the new one.
export default function Hop() {
  const router = useRouter();
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("s") ?? "", m = p.get("m") ?? "";
    router.replace(UUID.test(s) && UUID.test(m) ? `/chat?s=${s}&m=${m}` : "/");
  }, [router]);
  return <main className="gate" aria-busy="true" />;
}
