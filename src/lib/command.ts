import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function findExecutable(name: string): string | null {
  if (name.includes(path.sep)) return fs.existsSync(name) ? name : null;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const setprivPath = process.platform === "linux" ? findExecutable("setpriv") : null;

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  replaceEnv?: boolean;
  uid?: number;
  gid?: number;
  timeoutMs?: number;
  input?: string;
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
  allowFailure?: boolean;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  readonly command: string;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(command: string, code: number, stdout: string, stderr: string, message?: string) {
    super(message ?? `${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`);
    this.name = "CommandError";
    this.command = command;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

const MAX_CAPTURE = 2 * 1024 * 1024;

function makeLineReader(handler: (line: string, stream: "stdout" | "stderr") => void, stream: "stdout" | "stderr") {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.length > 0) handler(line, stream);
        index = buffer.indexOf("\n");
      }
      if (buffer.length > 64 * 1024) {
        handler(buffer.slice(0, 64 * 1024), stream);
        buffer = "";
      }
    },
    flush() {
      const line = buffer.replace(/\r$/, "");
      buffer = "";
      if (line.length > 0) handler(line, stream);
    },
  };
}

export function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env = options.replaceEnv
      ? { ...options.env }
      : { ...process.env, ...options.env };
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const detached = process.platform !== "win32";
    const dropGroups = Boolean(setprivPath && options.uid !== undefined && options.gid !== undefined);
    const spawnedCommand = dropGroups ? setprivPath! : command;
    const spawnedArgs = dropGroups
      ? [
          "--reuid",
          String(options.uid),
          "--regid",
          String(options.gid),
          "--clear-groups",
          "--",
          command,
          ...args,
        ]
      : args;
    const child = spawn(spawnedCommand, spawnedArgs, {
      cwd: options.cwd,
      env,
      uid: dropGroups ? undefined : options.uid,
      gid: dropGroups ? undefined : options.gid,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
      detached,
    });
    if (options.input !== undefined) {
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(options.input);
    }

    let stdout = "";
    let stderr = "";
    const outReader = options.onLine
      ? makeLineReader(options.onLine, "stdout")
      : undefined;
    const errReader = options.onLine
      ? makeLineReader(options.onLine, "stderr")
      : undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      outReader?.flush();
      errReader?.flush();
      if (error) {
        reject(error);
        return;
      }
      const code = child.exitCode ?? 1;
      if (code !== 0 && !options.allowFailure) {
        reject(
          new CommandError(
            [command, ...args].join(" "),
            code,
            stdout,
            stderr,
            `${command} failed with exit code ${code}${stderr.trim() ? `: ${stderr.trim().slice(-2000)}` : ""}`,
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          if (detached && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
        finish(new CommandError(command, 124, stdout, stderr, `${command} timed out`));
      }, options.timeoutMs);
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < MAX_CAPTURE) stdout += chunk;
      outReader?.push(chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < MAX_CAPTURE) stderr += chunk;
      errReader?.push(chunk);
    });

    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", () => {
      finish();
    });
  });
}

export async function hasCommand(command: string): Promise<boolean> {
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const result = await runCommand(finder, [command], { allowFailure: true, timeoutMs: 5000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function commandVersion(command: string, args: string[] = ["--version"]): Promise<string | null> {
  try {
    const result = await runCommand(command, args, { allowFailure: true, timeoutMs: 5000 });
    if (result.code !== 0) return null;
    return result.stdout.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}
