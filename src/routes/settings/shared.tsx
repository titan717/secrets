import type { User } from "@shared";
import { api } from "../../lib/api";
import { useSession } from "../../stores/session";

export type MePatch = Partial<Pick<User, "display_name" | "about" | "avatar_url" | "accent" | "status">>;

export async function patchMe(body: MePatch): Promise<User> {
  const u = await api("PATCH /v1/me", { body });
  useSession.getState().setUser(u);
  return u;
}

/** Outline "Aa" glyph used for the Fonts row (blueprint p17). */
export function AaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <text x="1" y="18" fontSize="16" fontFamily="Inter, system-ui, sans-serif" fontWeight="300" fill="currentColor">
        Aa
      </text>
    </svg>
  );
}

/** Mono Grace (mascot) glyph for the Grace row. */
export function GraceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 2.5c-4.6 0-8 3.3-8 7.9 0 1.3.3 2.4.8 3.4L3 17.2c-.3.6.2 1.2.8 1.1l2.6-.5C8 19.9 9.9 21.5 12 21.5s4-1.6 5.6-3.7l2.6.5c.6.1 1.1-.5.8-1.1l-1.8-3.4c.5-1 .8-2.1.8-3.4 0-4.6-3.4-7.9-8-7.9Zm-3.2 7.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Zm6.4 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"
      />
    </svg>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const LANGUAGES: { id: string; native: string; name: string; enabled?: boolean }[] = [
  { id: "ar", native: "العربية", name: "Arabic" },
  { id: "bn", native: "বাংলা", name: "Bengali" },
  { id: "en", native: "English", name: "English", enabled: true },
  { id: "fr", native: "Français", name: "French" },
  { id: "de", native: "Deutsch", name: "German" },
  { id: "gu", native: "ગુજરાતી", name: "Gujarati" },
  { id: "hi", native: "हिन्दी", name: "Hindi" },
  { id: "id", native: "Bahasa Indonesia", name: "Indonesian" },
  { id: "ja", native: "日本語", name: "Japanese" },
  { id: "kn", native: "ಕನ್ನಡ", name: "Kannada" },
  { id: "ko", native: "한국어", name: "Korean" },
  { id: "ml", native: "മലയാളം", name: "Malayalam" },
  { id: "mr", native: "मराठी", name: "Marathi" },
  { id: "pt", native: "Português", name: "Portuguese" },
  { id: "pa", native: "ਪੰਜਾਬੀ", name: "Punjabi" },
  { id: "ru", native: "Русский", name: "Russian" },
  { id: "es", native: "Español", name: "Spanish" },
  { id: "ta", native: "தமிழ்", name: "Tamil" },
  { id: "te", native: "తెలుగు", name: "Telugu" },
  { id: "ur", native: "اردو", name: "Urdu" },
];

export const APP_VERSION = "0.2.0";
