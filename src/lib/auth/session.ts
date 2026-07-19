import "server-only";
import { auth } from "./server";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
};

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const { data } = await auth.getSession();
  if (!data?.user) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name || data.user.email.split("@")[0] || "Morrow user",
  };
}
