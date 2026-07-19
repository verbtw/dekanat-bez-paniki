type AuthMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type AuthRouteContext = { params: Promise<{ path: string[] }> };

async function handleAuthRequest(
  method: AuthMethod,
  request: Request,
  context: AuthRouteContext,
) {
  let handlers: Awaited<ReturnType<typeof loadAuthHandlers>>;
  try {
    handlers = await loadAuthHandlers();
  } catch (error) {
    console.error("Neon Auth request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Authentication service is not configured" },
      { status: 503 },
    );
  }
  return handlers[method](request, context);
}

async function loadAuthHandlers() {
  const { auth } = await import("@/lib/auth/server");
  return auth.handler();
}

export function GET(request: Request, context: AuthRouteContext) {
  return handleAuthRequest("GET", request, context);
}

export function POST(request: Request, context: AuthRouteContext) {
  return handleAuthRequest("POST", request, context);
}

export function PUT(request: Request, context: AuthRouteContext) {
  return handleAuthRequest("PUT", request, context);
}

export function DELETE(request: Request, context: AuthRouteContext) {
  return handleAuthRequest("DELETE", request, context);
}

export function PATCH(request: Request, context: AuthRouteContext) {
  return handleAuthRequest("PATCH", request, context);
}
