import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    root: 'renderer',
    plugins: [
        react(),
        electron({
            main: {
                // Shortcut of `build.lib.entry`.
                entry: path.join(__dirname, 'main/index.ts'),
                vite: {
                    build: {
                        // For strictly separating builds
                        outDir: path.join(__dirname, 'dist-electron/main'),
                        rollupOptions: {
                            external: ['node:child_process', 'node:path', 'node:os', 'electron']
                        }
                    }
                }
            },
            preload: {
                // Shortcut of `build.rollupOptions.input`.
                input: path.join(__dirname, 'preload/index.ts'),
                vite: {
                    build: {
                        outDir: path.join(__dirname, 'dist-electron/preload')
                    }
                }
            },
            // Ployfill the Electron and Node.js built-in modules for Renderer process.
            // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
            renderer: {},
        }),
    ],
})
