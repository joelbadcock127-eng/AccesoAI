// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.accesoai.com.au',
  // Pages stay prerendered (static); only the /admin editor routes opt out.
  adapter: vercel(),
  security: {
    // The login POST can arrive via the host's proxy where the Origin header
    // doesn't match; the admin session cookie is SameSite=Lax so CSRF is
    // still covered.
    checkOrigin: false,
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
