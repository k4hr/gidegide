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

type RunCommandOptions = {
  logPrefix?: string;
  onOutput?: (text: string) => void | Promise<void>;
  isCanceled?: () => Promise<boolean>;
};

export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let finished = false;

    const cancelTimer = options.isCanceled
      ? setInterval(async () => {
          try {
            if (finished) return;

            const canceled = await options.isCanceled?.();

            if (canceled) {
              child.kill("SIGTERM");

              setTimeout(() => {
                if (!finished) {
                  child.kill("SIGKILL");
                }
              }, 2500);
            }
          } catch {
            // ignore cancel polling errors
          }
        }, 1200)
      : null;

    function writeLog(text: string, stream: "stdout" | "stderr") {
      if (options.logPrefix) {
        const output = `[${options.logPrefix}] ${text}`;

        if (stream === "stdout") {
          process.stdout.write(output);
        } else {
          process.stderr.write(output);
        }
      }

      Promise.resolve(options.onOutput?.(text)).catch(() => {});
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      writeLog(text, "stdout");
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      writeLog(text, "stderr");
    });

    child.on("error", (error) => {
      finished = true;

      if (cancelTimer) {
        clearInterval(cancelTimer);
      }

      reject(error);
    });

    child.on("close", async (code) => {
      finished = true;

      if (cancelTimer) {
        clearInterval(cancelTimer);
      }

      const canceled = await options.isCanceled?.().catch(() => false);

      if (canceled) {
        reject(new Error("Задача отменена пользователем"));
        return;
      }

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

export async function hasAudioStream(filePath: string) {
  try {
    const output = await readCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    return output
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .includes("audio");
  } catch {
    return false;
  }
}

export async function assertVideoHasAudio(filePath: string) {
  const hasAudio = await hasAudioStream(filePath);

  if (!hasAudio) {
    throw new Error(
      "В скачанном видео нет звука. Дай другое видео или ссылку, где доступен 720p MP4 со звуком.",
    );
  }
}
