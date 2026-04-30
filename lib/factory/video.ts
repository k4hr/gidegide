import { spawn } from "node:child_process";
import path from "node:path";

export function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function extFromName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  return ext || ".mp4";
}

export function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}\n${stderr.slice(-4000)}`,
        ),
      );
    });
  });
}

export function readCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}\n${stderr.slice(-4000)}`,
        ),
      );
    });
  });
}

export async function getVideoDurationSeconds(filePath: string) {
  const output = await readCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const duration = Number.parseFloat(output);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Не получилось узнать длительность видео");
  }

  return Math.floor(duration);
}
