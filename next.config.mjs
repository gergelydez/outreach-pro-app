/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PGlite (Postgres în WebAssembly) pentru baza de date a CRM-ului ținută în Vercel Blob:
    // se încarcă din node_modules la runtime, iar fișierele .wasm/.data sunt incluse explicit
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
    outputFileTracingIncludes: {
      '/api/crm/**/*': [
        './node_modules/@electric-sql/pglite/dist/*.js',
        './node_modules/@electric-sql/pglite/dist/*.cjs',
        './node_modules/@electric-sql/pglite/dist/*.wasm',
        './node_modules/@electric-sql/pglite/dist/*.data',
        './node_modules/@electric-sql/pglite/package.json',
      ],
    },
  },
}
export default nextConfig
