import { spawn, type ChildProcess } from "node:child_process";
import { config, unitName } from "../config.js";

export interface LogStream {
  stop: () => void;
}

export function streamRuntimeLogs(
  slug: string,
  onLine: (line: string) => void,
  onError: (message: string) => void,
  onEnd: () => void,
): LogStream {
  if (config.mock) {
    onLine("[mock] Runtime logs are not available in mock mode. Deploy the app on Linux to use journalctl.");
    setTimeout(onEnd, 100);
    return { stop: () => undefined };
  }

  let child: ChildProcess;
  try {
    child = spawn("journalctl", ["-u", unitName(slug), "-n", "200", "-f", "-o", "short-iso", "--no-pager"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    onEnd();
    return { stop: () => undefined };
  }

  let buffer = "";
  const consume = (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      onLine(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  child.once("error", (error) => {
    onError(`journalctl: ${error.message}`);
    onEnd();
  });
  child.once("close", () => {
    if (buffer.length > 0) onLine(buffer);
    onEnd();
  });

  return {
    stop: () => {
      child.removeAllListeners();
      child.kill("SIGTERM");
    },
  };
}
