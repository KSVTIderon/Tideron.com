import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = cookies();

  // Slett alle next-auth session cookies
  const cookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
  ];

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://tideron.com/planner";
  const innloggingUrl = baseUrl.replace(/\/planner$/, "") + "/planner/auth/innlogging";
  const response = NextResponse.redirect(innloggingUrl);

  cookieNames.forEach(name => {
    response.cookies.set(name, "", { expires: new Date(0), path: "/" });
  });

  return response;
}
