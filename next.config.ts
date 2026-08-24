import type { NextConfig } from "next";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/avatars/**" },
  { protocol: "https", hostname: "*.googleusercontent.com" },
];

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (configuredSupabaseUrl) {
  try {
    const parsed = new URL(configuredSupabaseUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      remotePatterns.push({
        protocol: parsed.protocol.slice(0, -1) as "http" | "https",
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: "/storage/v1/object/public/avatars/**",
      });
    }
  } catch {
    // Environment validation remains centralized in the Supabase config helper.
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns },
};

export default nextConfig;
