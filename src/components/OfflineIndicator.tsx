"use client";
import { useState, useEffect } from "react";

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 w-full z-[9999] bg-orange-500 text-white text-center text-xs py-1.5 font-medium shadow-md">
      ⚠️ Нет сети. Показаны сохраненные данные.
    </div>
  );
}