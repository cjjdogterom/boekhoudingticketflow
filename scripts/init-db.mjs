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

async function runSqlFile(path, label) {
  const sql = readFileSync(path, 'utf8')
  // Strip comments
  const cleaned = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
  try {
    await client.executeMultiple(cleaned)
    console.log(`✅ ${label} OK`)
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message)
  }
}

const root = dirname(fileURLToPath(import.meta.url))
console.log('📦 Schema...')
await runSqlFile(join(root, '..', 'turso', 'schema.sql'), 'schema')
console.log('🌱 Seed...')
await runSqlFile(join(root, '..', 'turso', 'seed.sql'), 'seed')

// Verify by counting categories
const { rows } = await client.execute('select count(*) as c from categories')
console.log(`\n📊 Categorieën in database: ${rows[0].c}`)
