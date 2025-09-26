import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'

import { ShaderPlane, EnergyRing } from '../ui/background-paper-shaders'
import { usePrefersReducedMotion } from '../../hooks/use-prefers-reduced-motion'

const SceneContent = () => {
  const prefersReducedMotion = usePrefersReducedMotion()
  const motionScale = prefersReducedMotion ? 0.15 : 1

  return (
    <group position={[0, 0, 0]}>
      <ShaderPlane position={[0, 0, 0]} color1="#ff5722" color2="#ffffff" motionScale={motionScale} />
      <ShaderPlane position={[0, 0, -0.45]} color1="#2563eb" color2="#14b8a6" motionScale={motionScale * 0.85} />
      {motionScale > 0 && <EnergyRing radius={1.4} position={[0, 0, 0.35]} motionScale={motionScale} />}
    </group>
  )
}

const TokenBackground = () => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 2.8], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  )
}

export default TokenBackground
