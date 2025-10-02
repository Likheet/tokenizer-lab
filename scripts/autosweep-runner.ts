import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Worker } from 'node:worker_threads'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

import type { AutoSweepJobConfig, AutoSweepWorkerMessage, SweepAxis } from '../src/autosweep/types'
import { AUTOSWEEP_PRESETS } from '../src/autosweep/presets'
import { autoSweepRowToCsv, AUTOSWEEP_CSV_HEADER } from '../src/autosweep/csv'
import { SeededRng, hashSeed } from '../src/autosweep/rng'
import { getPublicationLines } from '../src/autosweep/corpus'
import { PUBLICATION_TOKENIZERS } from '../src/autosweep/tokenizerIds'
import {
  AUTOSWEEP_APP_VERSION,
  TRANSFORMERS_JS_VERSION,
  TIKTOKEN_VERSION,
  WASM_HASH_PLACEHOLDER
} from '../src/autosweep/metadata'

type RunManifest = {
  jobId: string
  preset: AutoSweepJobConfig['preset']
  seed: number
  commitSha: string | null
  tokenizerIds: string[]
  axisSampleLines: Record<string, number>
  sweepConfig: AutoSweepJobConfig['sweeps']
  enabledAxes: SweepAxis[]
  flushEvery: number
  repeats: number
  transformersJsVersion: string | null
  tiktokenVersion: string | null
  wasmHash: string | null
  startTimestampUtc: string
  durationMs: number | null
  csvPath: string
  configPath: string
  logPath: string
}

type RunArtifacts = {
  rows: string[]
  configJson: string
  manifest: RunManifest
  logLines: string[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let bundledWorkerPath: string | null = null

async function ensureWorkerBundle(): Promise<string> {
  if (bundledWorkerPath) {
    return bundledWorkerPath
  }

  const outDir = path.join(os.tmpdir(), 'tokenizer-lab-autosweep')
  ensureDir(outDir)
  const outfile = path.join(outDir, 'autosweep.worker.mjs')

  await build({
    entryPoints: [path.resolve(__dirname, '../src/autosweep/autosweep.worker.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    outfile,
    sourcemap: 'inline'
  })

  bundledWorkerPath = outfile
  return outfile
}

export async function runAutoSweepJob(config: AutoSweepJobConfig): Promise<RunArtifacts> {
  const workerEntry = await ensureWorkerBundle()
  const worker = new Worker(workerEntry)

  const rows: string[] = []
  rows.push(AUTOSWEEP_CSV_HEADER)

  const logLines: string[] = []
  const start = Date.now()

  const seed = config.seed ?? hashSeed(config.jobId, config.lines.length, config.tokenizers.join(','))
  const rng = new SeededRng(seed)
  const jobId = config.jobId ?? `autosweep-${Date.now().toString(36)}-${rng.nextInt(1 << 30)}`

  const payload: AutoSweepJobConfig = {
    ...config,
    jobId,
    seed
  }

  const configJson = JSON.stringify(payload, null, 2)

  const manifest: RunManifest = {
    jobId,
    preset: payload.preset,
    seed,
    commitSha: resolveCommitSha(),
    tokenizerIds: payload.tokenizers,
    axisSampleLines: Object.fromEntries(Object.entries(payload.axisSampleLines ?? {})),
    sweepConfig: payload.sweeps,
    enabledAxes: payload.enabledAxes,
    flushEvery: payload.flushEvery ?? 200,
    repeats: payload.repeats,
  transformersJsVersion: TRANSFORMERS_JS_VERSION,
  tiktokenVersion: TIKTOKEN_VERSION,
  wasmHash: WASM_HASH_PLACEHOLDER,
    startTimestampUtc: new Date().toISOString(),
    durationMs: null,
    csvPath: '',
    configPath: '',
    logPath: ''
  }

  const donePromise = new Promise<RunArtifacts>((resolve, reject) => {
    worker.on('message', (message: AutoSweepWorkerMessage) => {
      switch (message.type) {
        case 'progress': {
          for (const row of message.rows) {
            rows.push(autoSweepRowToCsv(row))
          }
          logLines.push(
            JSON.stringify({
              type: 'progress',
              processed: message.processed,
              total: message.total,
              chunk: message.rows.length,
              timeMs: Date.now() - start
            })
          )
          break
        }
        case 'done': {
          manifest.durationMs = message.durationMs
          logLines.push(
            JSON.stringify({
              type: 'done',
              processed: message.processed,
              total: message.total,
              durationMs: message.durationMs
            })
          )
          worker.terminate()
          resolve({ rows, configJson, manifest, logLines })
          break
        }
        case 'error': {
          logLines.push(
            JSON.stringify({
              type: 'error',
              message: message.message,
              stack: message.stack,
              timeMs: Date.now() - start
            })
          )
          worker.terminate()
          reject(new Error(message.message))
          break
        }
        default:
          break
      }
    })

    worker.on('error', (error) => {
      worker.terminate()
      const message = error instanceof Error ? error.message : String(error)
      logLines.push(JSON.stringify({ type: 'worker_error', error: message, timeMs: Date.now() - start }))
      reject(new Error(message))
    })
  })

  worker.postMessage({ type: 'start', payload })

  return donePromise.finally(() => {
    if (typeof worker.terminate === 'function') {
      worker.terminate()
    }
  })
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeFileSync(filePath: string, contents: string) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, contents, 'utf-8')
}

export async function runAndPersistAutoSweep(config: AutoSweepJobConfig, outputDir: string) {
  const result = await runAutoSweepJob(config)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const csvPath = path.join(outputDir, `autosweep_${config.preset}_${timestamp}.csv`)
  writeFileSync(csvPath, result.rows.join('\n'))

  const configPath = path.join(outputDir, `autosweep_config_${timestamp}.json`)
  writeFileSync(configPath, result.configJson)

  const logPath = path.join(outputDir, `autosweep_log_${timestamp}.jsonl`)
  writeFileSync(logPath, result.logLines.join('\n'))

  const manifest: RunManifest = {
    ...result.manifest,
    csvPath,
    configPath,
    logPath
  }

  const manifestPath = path.join(outputDir, `autosweep_manifest_${timestamp}.json`)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return {
    csvPath,
    configPath,
    logPath,
    manifestPath
  }
}

function resolveCommitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

function buildDefaultConfig(preset: 'fast' | 'full'): AutoSweepJobConfig {
  const definition = AUTOSWEEP_PRESETS[preset]
  const enabledAxes = Object.keys(definition.sweeps) as SweepAxis[]

  return {
    jobId: `autosweep-cli-${Date.now().toString(36)}`,
    lines: getPublicationLines(),
    tokenizers: [...PUBLICATION_TOKENIZERS],
    sweeps: definition.sweeps,
    enabledAxes,
    preset,
    sampleLines: definition.sampleLines,
    repeats: definition.repeats,
    flushEvery: 200
  }
}

if (process.argv[1] && process.argv[1].endsWith('autosweep-runner.ts')) {
  const outputDir = process.argv[2] ?? path.resolve(process.cwd(), 'autosweep-output')
  const preset = process.argv[3] === 'fast' ? 'fast' : 'full'

  runAndPersistAutoSweep(buildDefaultConfig(preset), outputDir)
    .then((artifacts) => {
      console.log('AutoSweep run complete:', artifacts)
    })
    .catch((error) => {
      console.error('AutoSweep run failed:', error)
      process.exitCode = 1
    })
}
