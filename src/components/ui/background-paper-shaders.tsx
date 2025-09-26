"use client"

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Vertex shader
const vertexShader = `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    vec3 pos = position;
    pos.y += sin(pos.x * 10.0 + time) * 0.1 * intensity;
    pos.x += cos(pos.y * 8.0 + time * 1.5) * 0.05 * intensity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// Fragment shader
const fragmentShader = `
  uniform float time;
  uniform float intensity;
  uniform vec3 color1;
  uniform vec3 color2;
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vec2 uv = vUv;
    float noise = sin(uv.x * 20.0 + time) * cos(uv.y * 15.0 + time * 0.8);
    noise += sin(uv.x * 35.0 - time * 2.0) * cos(uv.y * 25.0 + time * 1.2) * 0.5;
    vec3 color = mix(color1, color2, noise * 0.5 + 0.5);
    color = mix(color, vec3(1.0), pow(abs(noise), 2.0) * intensity);
    float glow = 1.0 - length(uv - 0.5) * 2.0;
    glow = pow(glow, 2.0);
    gl_FragColor = vec4(color * glow, glow * 0.8);
  }
`

export function ShaderPlane({
  position,
  color1 = '#ff5722',
  color2 = '#ffffff',
  motionScale = 1
}: {
  position: [number, number, number]
  color1?: string
  color2?: string
  motionScale?: number
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      intensity: { value: 1.0 },
      color1: { value: new THREE.Color(color1) },
      color2: { value: new THREE.Color(color2) }
    }),
    [color1, color2]
  )

  useFrame((state) => {
    if (mesh.current) {
      uniforms.time.value = state.clock.elapsedTime
      const base = 1.0 + Math.sin(state.clock.elapsedTime * 2) * 0.3
      uniforms.intensity.value = base * motionScale
    }
  })

  return (
    <mesh ref={mesh} position={position}>
      <planeGeometry args={[2, 2, 32, 32]} />
      <shaderMaterial
        args={[{
          uniforms,
          vertexShader,
          fragmentShader,
          transparent: true,
          side: THREE.DoubleSide
        } as THREE.ShaderMaterialParameters]}
      />
    </mesh>
  )
}

export function EnergyRing({
  radius = 1,
  position = [0, 0, 0],
  motionScale = 1
}: {
  radius?: number
  position?: [number, number, number]
  motionScale?: number
}) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.z = state.clock.elapsedTime * motionScale
      const material: any = mesh.current.material
      const baseOpacity = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3
      material.opacity = baseOpacity * motionScale
    }
  })
  return (
    <mesh ref={mesh} position={position as any}>
      <ringGeometry args={[radius * 0.8, radius, 32]} />
      <meshBasicMaterial
        args={[{
          color: new THREE.Color('#ff5722'),
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        }]}
      />
    </mesh>
  )
}
