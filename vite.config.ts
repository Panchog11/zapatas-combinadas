import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './', // rutas relativas: funciona en GitHub Pages y abriendo dist/ localmente
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', include: ['src/tests/**/*.test.ts'] },
} as never);
