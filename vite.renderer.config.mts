import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Tailwind 4 ships its own Vite plugin (faster than the PostCSS path).
// No tailwind.config / postcss.config file needed — config is via @theme
// in src/renderer/index.css.
export default defineConfig({
  plugins: [tailwindcss()],
});
