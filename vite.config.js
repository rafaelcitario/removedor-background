import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

export default {
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'esnext' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
}
