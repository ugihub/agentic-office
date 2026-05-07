"use client";
import { useState, useEffect } from "react";

export interface Settings {
  apiUrl: string;
  apiKey: string;
}

const DEFAULTS: Settings = {
  apiUrl: process.env["NEXT_PUBLIC_BUREAU_API_URL"] ?? "http://localhost:3001",
  apiKey: process.env["NEXT_PUBLIC_BUREAU_API_KEY"] ?? "",
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setSettings({
      apiUrl: localStorage.getItem("bureau_api_url") ?? DEFAULTS.apiUrl,
      apiKey: localStorage.getItem("bureau_api_key") ?? DEFAULTS.apiKey,
    });
  }, []);

  function save(next: Settings) {
    localStorage.setItem("bureau_api_url", next.apiUrl);
    localStorage.setItem("bureau_api_key", next.apiKey);
    setSettings(next);
  }

  return { settings, save };
}
