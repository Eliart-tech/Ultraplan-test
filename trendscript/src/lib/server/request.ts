/**
 * Request-body helpers for route handlers: size cap, JSON parsing and zod
 * validation, with French JSON errors returned *before* any stream opens
 * (status and headers are fixed once the first byte is sent).
 */

import type { z } from "zod";
import { describeZodError } from "../schemas";

const encoder = new TextEncoder();

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 1_000_000,
): Promise<ParsedBody<z.output<S>>> {
  const tooLarge = () => ({ ok: false as const, response: jsonError("Requête trop volumineuse.", 413) });
  if (Number(request.headers.get("content-length")) > maxBytes) return tooLarge();

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError("Requête illisible.", 400) };
  }
  if (encoder.encode(text).byteLength > maxBytes) return tooLarge();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: jsonError("Requête invalide : corps JSON attendu.", 400) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, response: jsonError(describeZodError(parsed.error), 400) };
  return { ok: true, data: parsed.data };
}
