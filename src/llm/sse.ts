/**
 * Generic SSE parser: reads the stream from a fetch Response body,
 * splits events by `\n\n`, and yields the data payload of each event (multiple data: lines joined).
 *
 * Only returns the data line contents (the "data: " prefix already stripped);
 * the event type (the event: line) is parsed by the caller as needed from the payload.
 */
export async function* readSSE(
  response: Response
): AsyncGenerator<string, void, void> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = extractData(rawEvent);
        if (data) yield data;
      }
    }
    // flush: process the trailing buffer when there is no terminating blank line
    if (buffer.trim()) {
      const data = extractData(buffer);
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Extract the joined data contents from a single SSE event block. */
function extractData(rawEvent: string): string {
  return rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
}
