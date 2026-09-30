import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Ingen ekstra logikk nødvendig — withAuth håndterer redirect til innlogging
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      // Må inkludere /planner-prefikset — withAuth håndterer ikke basePath automatisk
      signIn: "/planner/auth/innlogging",
    },
  }
);

export const config = {
  matcher: [
    "/((?!auth|api|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
