const mode = process.argv[2];

if (mode === "echo") {
  process.stdin.pipe(process.stdout);
}

if (mode === "deaf") {
  process.stdin.pause();
  setInterval(() => undefined, 1000);
}

if (mode === "stubborn") {
  process.on("SIGTERM", () => undefined);
  process.stdin.resume();
  process.stdout.write("ready");
  setInterval(() => undefined, 1000);
}

if (mode === "noisy") {
  process.stderr.write("x".repeat(1024 * 1024), () => process.stdout.write("ready"));
  setInterval(() => undefined, 1000);
}
