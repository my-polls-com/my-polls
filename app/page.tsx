"use client";
import { useEffect } from "react";
export default function Home() {
  useEffect(() => {
    window.location.href = "/prod1_05_25_.html";
  }, []);
  return null;
}
