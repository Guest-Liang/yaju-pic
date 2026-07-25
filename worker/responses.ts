const API_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      ...API_HEADERS,
      ...init.headers,
    },
  })
}

export function jsonError(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ ok: false, error: message, ...extra }, { status })
}

export function redirectResponse(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  })
}
