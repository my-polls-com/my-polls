"use client";
import { useEffect } from "react";
export default function Home() {
  useEffect(() => {
    window.history.replaceState(null, "", "/");
  }, []);
  return (
    <iframe 
      src="/prod1_05_25_.html" 
      style={{width:"100%", height:"100vh", border:"none"}}
    />
  );
}
