import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mantiene el rastreo/watcher acotado al proyecto (en Windows, sin esto el
  // watcher intenta escanear la raíz de C:\ y ensucia el log con errores EINVAL).
  outputFileTracingRoot: path.join(__dirname),
  // Prisma se resuelve en runtime (build WASM en Cloudflare Workers).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

// Expone los bindings de Cloudflare (getCloudflareContext) también en `next dev`.
initOpenNextCloudflareForDev();
