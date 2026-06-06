import { execFileSync, spawnSync } from "node:child_process";

const image = process.env.POSTGRES_DOCKER_IMAGE ?? "postgres:17-alpine";
const name = `domino-poker-postgres-test-${process.pid}`;
const npmCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const npmArgsPrefix = process.platform === "win32" ? ["/d", "/s", "/c", "npm"] : [];

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: "inherit", shell: false, ...options });
}

function output(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function assertOk(result, message) {
  if (result.error) {
    throw new Error(`${message} ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(message);
  }
}

function stopContainer() {
  run("docker", ["rm", "-f", "-v", name], { stdio: "ignore" });
}

try {
  assertOk(run("docker", ["--version"]), "Docker is required to run PostgreSQL integration tests.");

  stopContainer();
  assertOk(
    run("docker", [
      "run",
      "--name",
      name,
      "--tmpfs",
      "/var/lib/postgresql/data:rw",
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      "POSTGRES_USER=postgres",
      "-e",
      "POSTGRES_DB=domino_test",
      "-p",
      "127.0.0.1::5432",
      "-d",
      image
    ]),
    "Failed to start the PostgreSQL Docker container."
  );

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = run("docker", ["exec", name, "pg_isready", "-U", "postgres", "-d", "domino_test"], {
      stdio: "ignore"
    });
    if (result.status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) {
    throw new Error("PostgreSQL Docker container did not become ready.");
  }

  const portMapping = output("docker", ["port", name, "5432/tcp"]);
  const port = portMapping.split(":").at(-1);
  if (!port) {
    throw new Error(`Could not determine PostgreSQL host port from: ${portMapping}`);
  }

  const env = {
    ...process.env,
    TEST_POSTGRES_DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${port}/domino_test`
  };
  assertOk(
    run(npmCommand, [...npmArgsPrefix, "run", "test:postgres", "--workspace", "apps/server"], {
      env
    }),
    "PostgreSQL integration tests failed."
  );
} finally {
  stopContainer();
}
