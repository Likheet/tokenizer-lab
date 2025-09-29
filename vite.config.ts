import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Get git commit hash and build time for provenance tracking
function getGitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function getBuildTime(): string {
  return new Date().toISOString()
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  define: {
    // Inject build-time constants for provenance tracking
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(getBuildTime()),
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(getGitCommit()),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version ?? '0.0.0')
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          three: ['three', '@react-three/fiber']
        }
      }
    }
  },
  worker: {
    format: 'es'
  }
})
