#!/usr/bin/env node
// Run the schema + seed against your Turso database.
// Reads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from .env.local
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load .env.local
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
  const env = readFileSync(envPath, 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2]
  }
} catch { /* skip if no .env.local */ }

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error('❌ TURSO_DATABASE_URL ontbreekt in .env.local')
  process.exit(1)
}

const client = createClient({ url, authToken })

async function runSqlFile(path) {
  const sql = readFileSync(path, 'utf8')
  // Split on semicolons not inside strings, then run each statement
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))
  for (const stmt of statements) {
    if (!stmt) continue
    try {
      await client.execute(stmt)
    } catch (err) {
      console.error('❌ Failed:', stmt.slice(0, 80))
      console.error(err.message)
    }
  }
}

const root = dirname(fileURLToPath(import.meta.url))
console.log('📦 Running schema.sql...')
await runSqlFile(join(root, '..', 'turso', 'schema.sql'))
console.log('🌱 Running seed.sql...')
await runSqlFile(join(root, '..', 'turso', 'seed.sql'))
console.log('✅ Done!')
