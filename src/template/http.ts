import { requestUrl } from "obsidian";
import { OpError, describeError, requestErrorMessage } from "../utils/error";

/**
 * Fetch the full markdown text of an http(s) URL. Throws OpError on non-2xx / network error.
 * Deliberately does not import builtin-template, to avoid coupling tests to the .md file.
 */
export async function fetchHttpTemplate(url: string): Promise<string> {
  if (!url.trim()) throw new OpError("URL template has no URL configured");
  let res;
  try {
    res = await requestUrl({ url, method: "GET", throw: false });
  } catch (e) {
    throw new OpError(`Failed to fetch template: ${describeError(e)}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new OpError(requestErrorMessage(res, "fetch template"));
  }
  return res.text;
}
