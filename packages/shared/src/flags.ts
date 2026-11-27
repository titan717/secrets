/**
 * Feature flags. Evaluated on the server (env) and exposed at GET /v1/config.
 * The client uses them for UX only — never for authorization.
 */
export interface FeatureFlags {
  calls: boolean;
  ai: boolean;
  docks: boolean;
  attachments: boolean;
  emailVerification: boolean;
  /** Moments, Notes, Tasks, Vault — out of MVP scope, hidden unless explicitly enabled. */
  experimental: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  calls: true,
  ai: true,
  docks: true,
  attachments: true,
  emailVerification: false,
  experimental: false,
};

const isOn = (v: string | undefined) => v === "1" || v === "true" || v === "on" || v === "yes";

function flag(env: Record<string, string | undefined>, name: string, fallback: boolean): boolean {
  const raw = env[`FEATURE_${name.toUpperCase()}`];
  return raw === undefined ? fallback : isOn(raw);
}

export function flagsFromEnv(env: Record<string, string | undefined> = {}): FeatureFlags {
  return {
    calls: flag(env, "calls", true),
    ai: flag(env, "ai", true),
    docks: flag(env, "docks", true),
    attachments: flag(env, "attachments", true),
    emailVerification: flag(env, "email_verification", env.NODE_ENV === "production"),
    experimental: flag(env, "experimental", false),
  };
}
