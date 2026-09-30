import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sjekkPassord } from "@/lib/passord";
import { sjekkRateLimit, nullstillRateLimit } from "@/lib/rateLimit";
import { headers } from "next/headers";

const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL    ?? "ksv@tideron.com").toLowerCase();
const ADMIN_PASSWORD =  process.env.ADMIN_PASSWORD ?? "";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "E-post",  type: "email"    },
        password: { label: "Passord", type: "password" },
      },
      async authorize(credentials) {
        const email   = (credentials?.email    ?? "").trim().toLowerCase();
        const passord  = credentials?.password ?? "";
        if (!email || !passord) return null;

        // ── Rate limiting: maks 5 forsøk per IP per 15 min ────────────────
        const headerList = headers();
        const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim()
                ?? headerList.get("x-real-ip")
                ?? "ukjent";
        const { isBlocked, secondsLeft } = sjekkRateLimit(ip);
        if (isBlocked) {
          throw new Error(`For mange forsøk. Prøv igjen om ${Math.ceil(secondsLeft / 60)} minutter.`);
        }

        // ── Admin-snarvei via env-variabel ─────────────────────────────────
        if (email === ADMIN_EMAIL) {
          if (!ADMIN_PASSWORD || passord !== ADMIN_PASSWORD) return null;
          nullstillRateLimit(ip); // vellykket login = nullstill teller
          return { id: "admin", email: ADMIN_EMAIL, name: "Admin" };
        }

        // ── Vanlig bruker: sjekk allowed_users-tabellen ────────────────────
        try {
          const { data } = await supabaseAdmin
            .from("allowed_users")
            .select("id, email, navn, password_hash")
            .eq("email", email)
            .maybeSingle();

          if (!data?.password_hash) return null;
          const ok = await sjekkPassord(passord, data.password_hash);
          if (!ok) return null;
          nullstillRateLimit(ip); // vellykket login = nullstill teller
          return { id: data.id, email: data.email, name: data.navn ?? data.email };
        } catch (e: any) {
          if (e?.message?.includes("For mange forsøk")) throw e;
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        if (token.sub)   (session.user as any).id    = token.sub;
        if (token.email) (session.user as any).email = token.email;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.email = user.email; }
      return token;
    },
    async redirect({ url, baseUrl }) {
      // Sikre at alle redirects har /planner-prefiks
      // url kan være relativ (f.eks. /prosjekter) eller absolutt
      try {
        const parsed = new URL(url, baseUrl);
        const path   = parsed.pathname;
        // Hvis stien allerede starter med /planner, bruk som den er
        if (path.startsWith("/planner")) return parsed.toString();
        // Ellers legg til /planner foran
        parsed.pathname = "/planner" + path;
        return parsed.toString();
      } catch {
        return baseUrl + "/planner/prosjekter";
      }
    },
  },
  pages:   { signIn: "/auth/innlogging" },
  session: { strategy: "jwt" },
};
