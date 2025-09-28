export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    // Mulberry32
    this.state = (this.state + 0x6D2B79F5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max)
  }

  pick<T>(items: readonly T[]): T {
    return items[this.nextInt(items.length)]
  }
}

export function hashSeed(...parts: (number | string)[]): number {
    let hash = 2166136261 >>> 0
    for (const part of parts) {
      const str = typeof part === 'number' ? part.toString(16) : part
      for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
    }
    return hash >>> 0
}
