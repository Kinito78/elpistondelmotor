/**
 * Reset determinista de la base local:
 *   1. borra el archivo SQLite,
 *   2. reaplica las migraciones (`prisma migrate deploy`),
 *   3. corre el seed.
 *
 * Se hace con operaciones explícitas en lugar de `prisma migrate reset` para que
 * el comando funcione igual en cualquier entorno (incluidos los no interactivos).
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaDir = resolve(root, "prisma");

const url = process.env.DATABASE_URL ?? "file:./dev.db";
if (!url.startsWith("file:")) {
  console.error(`[db:reset] Solo soporta SQLite (DATABASE_URL=${url}).`);
  process.exit(1);
}

// Las rutas relativas de SQLite se resuelven desde la carpeta del schema.
const rawPath = url.slice("file:".length);
const dbPath = isAbsolute(rawPath) ? rawPath : resolve(prismaDir, rawPath);

for (const file of [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (!existsSync(file)) continue;
  try {
    rmSync(file, { force: true });
    console.log(`[db:reset] eliminado ${file}`);
  } catch (err) {
    // En Windows el archivo puede estar bloqueado por un dev server en marcha.
    // El seed borra y recrea todas las filas, así que el reset de datos igual se
    // completa; solo se conserva el archivo.
    console.warn(
      `[db:reset] no se pudo borrar ${file} (${err.code ?? err.message}); se reinician los datos sobre el archivo existente.`
    );
    break;
  }
}

const run = (command) => execSync(command, { cwd: root, stdio: "inherit" });

run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts");

console.log("[db:reset] Base recreada y sembrada.");
