import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            // Em dev, o front chama /api/* e o Vite repassa ao backend, mantendo
            // tudo "same-origin" — cookies httpOnly fluem sem dor de CORS.
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: function (p) { return p.replace(/^\/api/, ''); },
            },
        },
    },
});
