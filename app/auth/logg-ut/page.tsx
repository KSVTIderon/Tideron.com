"use client";
import { useEffect } from "react";

export default function LoggUtPage() {
  useEffect(() => {
    window.location.href = "/planner/api/logg-ut";
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F2A5A]">
      <p className="text-white text-sm">Logger ut...</p>
    </div>
  );
}
