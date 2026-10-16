export const ACTIVE_SEASON_YEAR = 2026;

export function demoAllowed(): boolean {
  return process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}

export function localAuthAllowed(): boolean {
  return process.env.ALLOW_LOCAL_AUTH === "true" && process.env.NODE_ENV !== "production";
}

export function organizerPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && (process.env.SESSION_SECRET ?? "").length >= 16);
}

export function supabaseAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabaseStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_STORAGE_BUCKET_PUBLIC &&
      process.env.SUPABASE_STORAGE_BUCKET_PRIVATE,
  );
}

/** CricHeroes has no approved API in this build. Manual links remain available. */
export function cricheroesSyncAvailable(): boolean {
  return false;
}

export function paymentGatewayAvailable(): boolean {
  return false;
}

export type IntegrationStatus = {
  database: "postgres" | "embedded";
  supabaseAuth: boolean;
  supabaseStorage: boolean;
  localAuth: boolean;
  demo: boolean;
  cricheroesSync: false;
  paymentGateway: false;
};

export function integrationStatus(): IntegrationStatus {
  return {
    database: process.env.DATABASE_URL ? "postgres" : "embedded",
    supabaseAuth: supabaseAuthConfigured(),
    supabaseStorage: supabaseStorageConfigured(),
    localAuth: localAuthAllowed(),
    demo: demoAllowed(),
    cricheroesSync: false,
    paymentGateway: false,
  };
}
