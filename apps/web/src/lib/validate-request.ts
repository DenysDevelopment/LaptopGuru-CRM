import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Parse and validate a Next.js API route request body against a Zod schema.
 * Returns either validated data or a ready-to-return 400 NextResponse.
 *
 * Usage:
 *   const result = await validateRequest(request, mySchema);
 *   if (!result.ok) return result.response;
 *   const data = result.data;
 */
export async function validateRequest<T>(
  req: NextRequest,
  schema: ZodType<T>,
): Promise<ValidationResult<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Некорректный JSON" },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Ошибка валидации",
          fields: flattened.fieldErrors,
          formErrors: flattened.formErrors,
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
