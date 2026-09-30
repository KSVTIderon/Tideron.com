/** @type {import('next').NextConfig} */

// NEXTAUTH_URL settes per Vercel-prosjekt som env-variabel:
//   tideron-test:  https://tideron-test.vercel.app/planner
//   tideron-app:   https://tideron-app.vercel.app/planner
// VERCEL_PROJECT_PRODUCTION_URL brukes som fallback (stabil prosjekt-URL).
const nextauthUrl =
  process.env.NEXTAUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/planner`
    : "http://localhost:3000/planner");

const nextConfig = {
  env: { NEXTAUTH_URL: nextauthUrl },

  // Appen er tilgjengelig på tideron.com/planner
  basePath: '/planner',

  // Redirect rot-URL (/) → /planner uavhengig av basePath
  async redirects() {
    return [
      {
        source: '/',
        destination: '/planner',
        permanent: false,
        basePath: false,
      },
    ];
  },

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
