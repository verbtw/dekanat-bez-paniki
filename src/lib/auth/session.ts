import "server-only";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
};

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    // Keep the public shell available when Auth has not been provisioned yet.
    // Importing lazily also lets us fail closed instead of crashing /api/session.
    const { auth } = await import("./server");
    const { data } = await auth.getSession();
    if (!data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name || data.user.email.split("@")[0] || "Morrow user",
    };
  } catch (error) {
    console.error("Neon Auth session lookup failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}
