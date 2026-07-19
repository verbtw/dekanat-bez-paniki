import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getAuthConfig } from "./config";

const config = getAuthConfig(process.env);

export const auth = createNeonAuth({
  baseUrl: config.baseUrl,
  cookies: {
    secret: config.cookieSecret,
    sameSite: "strict",
  },
  logLevel: "warn",
});
