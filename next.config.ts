import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mantiene el rastreo/watcher acotado al proyecto (en Windows, sin esto el
  // watcher intenta escanear la raíz de C:\ y ensucia el log con errores EINVAL).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
