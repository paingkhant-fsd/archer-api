import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

const databasePath = resolve("test.db");

export default async function setup(): Promise<void> {
  await rm(databasePath, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
  await rm(`${databasePath}-wal`, { force: true });

  const migration = await readFile(
    resolve("prisma/migrations/20260910151837_init/migration.sql"),
    "utf8",
  );
  const client = createClient({ url: "file:./test.db" });
  try {
    await client.executeMultiple(migration);
  } finally {
    client.close();
  }
}
