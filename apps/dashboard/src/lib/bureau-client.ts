import { BureauClient } from "@bureau/sdk";

export function getSettings(): { apiUrl: string; apiKey: string } {
  const defaultUrl =
    process.env["NEXT_PUBLIC_BUREAU_API_URL"] ?? "http://localhost:3001";
  const defaultKey = process.env["NEXT_PUBLIC_BUREAU_API_KEY"] ?? "";

  if (typeof window === "undefined") {
    return { apiUrl: defaultUrl, apiKey: defaultKey };
  }

  return {
    apiUrl: localStorage.getItem("bureau_api_url") ?? defaultUrl,
    apiKey: localStorage.getItem("bureau_api_key") ?? defaultKey,
  };
}

export function createBureauClient(): BureauClient {
  const { apiUrl, apiKey } = getSettings();
  return new BureauClient({ baseUrl: apiUrl, apiKey });
}
