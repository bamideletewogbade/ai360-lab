import assert from 'node:assert/strict'
import test from 'node:test'
import { productionReadinessChecks, selectedDatabaseProvider } from '../src/lib/runtime-config.ts'

const managedKeys = [
  'OPENROUTER_API_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'DATABASE_PROVIDER',
  'DATABASE_URL',
  'NEXT_PUBLIC_BILLING_ENABLED',
] as const

function withEnvironment(values: Partial<Record<(typeof managedKeys)[number], string>>, run: () => void) {
  const previous = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]))
  for (const key of managedKeys) delete process.env[key]
  Object.assign(process.env, values)
  try {
    run()
  } finally {
    for (const key of managedKeys) {
      const value = previous[key]
      if (typeof value === 'string') process.env[key] = value
      else delete process.env[key]
    }
  }
}

test('partial Clerk configuration is reported as invalid', () => {
  withEnvironment({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example' }, () => {
    const clerk = productionReadinessChecks().find((check) => check.key === 'clerk')
    assert.equal(clerk?.status, 'invalid')
    assert.equal(clerk?.required, true)
  })
})

test('Postgres is the data plane and is ready once a connection string exists', () => {
  withEnvironment({ DATABASE_URL: 'postgresql://example.invalid/db' }, () => {
    assert.equal(selectedDatabaseProvider(), 'postgres')
    assert.equal(productionReadinessChecks().find((check) => check.key === 'database')?.status, 'ready')
  })
})

test('no connection string means no database, and that blocks readiness', () => {
  withEnvironment({}, () => {
    assert.equal(selectedDatabaseProvider(), 'none')
    const database = productionReadinessChecks().find((check) => check.key === 'database')
    assert.equal(database?.status, 'missing')
    assert.equal(database?.required, true)
  })
})

test('a stale DATABASE_PROVIDER value cannot resurrect a second data plane', () => {
  // MySQL was retired on 2026-08-05. Leaving the old flag set in an environment
  // must not change which database the application talks to.
  withEnvironment({
    DATABASE_PROVIDER: 'mysql',
    DATABASE_URL: 'postgresql://example.invalid/db',
  }, () => assert.equal(selectedDatabaseProvider(), 'postgres'))
})
