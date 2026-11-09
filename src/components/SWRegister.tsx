"use client";
import { useEffect } from "react";
import { registerSW } from "@/lib/push-client";

export default function SWRegister() {
  useEffect(() => { void registerSW(); }, []);
  return null;
}
