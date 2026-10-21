process.umask(0o077);

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

const { start } = await import("./server.js");

start().catch((error) => {
  console.error("[paas] failed to start", error);
  process.exit(1);
});
