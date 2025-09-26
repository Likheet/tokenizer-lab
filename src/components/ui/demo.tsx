"use client"

import { useState } from 'react'
// Placeholder imports for external shader components (not yet installed)
// Once @paper-design/shaders-react is added, these will resolve.
// import { MeshGradient, DotOrbit } from '@paper-design/shaders-react'

export default function DemoOne() {
  // Future interactive controls (intensity/speed/interaction) removed until wired
  const speed = 1.0
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText('pnpm i 21st')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Effects would mount here when dependency installed */}
      <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs">
        MeshGradient placeholder
      </div>

      {/* Lighting overlay effects */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/3 top-1/4 h-32 w-32 animate-pulse rounded-full bg-gray-800/5 blur-3xl"
          style={{ animationDuration: `${3 / speed}s` }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 h-24 w-24 animate-pulse rounded-full bg-white/5 blur-2xl"
          style={{ animationDuration: `${2 / speed}s`, animationDelay: '1s' }}
        />
        <div
          className="absolute right-1/3 top-1/2 h-20 w-20 animate-pulse rounded-full bg-gray-900/30 blur-xl"
          style={{ animationDuration: `${4 / speed}s`, animationDelay: '0.5s' }}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center font-mono text-xs text-white/40">
          <div>...21st-cli...</div>
          <div className="mt-1 flex items-center gap-2">
            <span>pnpm i 21st.dev</span>
            <button
              onClick={copyToClipboard}
              className="pointer-events-auto text-white/60 opacity-30 transition-opacity hover:opacity-60 hover:text-white/80"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}