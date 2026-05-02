function isRetryableDbError(error: unknown) {
  const anyError = error as {
    code?: string;
    message?: string;
  };

  const message = String(anyError?.message ?? "").toLowerCase();

  return (
    anyError?.code === "P1017" ||
    message.includes("server has closed the connection") ||
    message.includes("connection reset by peer") ||
    message.includes("connection reset") ||
    message.includes("terminating connection") ||
    message.includes("closed the connection")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableDbError(error) || attempt === retries) {
        throw error;
      }

      await wait(500 * (attempt + 1));
    }
  }

  throw lastError;
}
