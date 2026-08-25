import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `BASE_URL` permite publicar la app en un subdirectorio (GitHub Pages la sirve en
// `/<repo>/`). En desarrollo y en un dominio propio se queda en la raíz, que es el valor por
// omisión: así el mismo código sirve para las dos formas de alojarlo sin ramas en el código.
const base = process.env.BASE_URL ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5273, strictPort: true },
})
