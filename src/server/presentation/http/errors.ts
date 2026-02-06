export function badRequest(message = "Bad Request"): Response {
  return new Response(message, { status: 400 });
}

export function notFound(message = "Not Found"): Response {
  return new Response(message, { status: 404 });
}

export function unsupportedMediaType(message: string): Response {
  return new Response(message, { status: 415 });
}

export function payloadTooLarge(message: string): Response {
  return new Response(message, { status: 413 });
}

export function internalServerError(message: string): Response {
  return new Response(message, { status: 500 });
}
