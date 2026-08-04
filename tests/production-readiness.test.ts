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
  'MYSQL_HOST',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
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

test('the current MySQL data plane can be marked ready when fully configured', () => {
  withEnvironment({
    DATABASE_PROVIDER: 'mysql',
    MYSQL_HOST: 'database.internal',
    MYSQL_DATABASE: 'ai360_lab',
    MYSQL_USER: 'ai360_app',
    MYSQL_PASSWORD: 'not-a-real-password',
  }, () => {
    assert.equal(selectedDatabaseProvider(), 'mysql')
    assert.equal(productionReadinessChecks().find((check) => check.key === 'database')?.status, 'ready')
  })
})

test('Supabase remains pending until application data routes are cut over', () => {
  withEnvironment({ DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'postgresql://example.invalid/db' }, () => {
    assert.equal(selectedDatabaseProvider(), 'postgres')
    assert.equal(productionReadinessChecks().find((check) => check.key === 'database')?.status, 'pending')
  })
})

test('a staged Supabase URL cannot override an explicit MySQL production data plane', () => {
  withEnvironment({
    DATABASE_PROVIDER: 'mysql',
    DATABASE_URL: 'postgresql://staged.example.invalid/postgres',
    MYSQL_HOST: 'database.internal',
    MYSQL_DATABASE: 'ai360_lab',
    MYSQL_USER: 'ai360_app',
    MYSQL_PASSWORD: 'not-a-real-password',
  }, () => assert.equal(selectedDatabaseProvider(), 'mysql'))
})
