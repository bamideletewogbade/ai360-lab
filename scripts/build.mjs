import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function safeReleaseId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100)
}

/** @param {Record<string, string | undefined>} env */
export function resolveDeploymentId(env = process.env, readGitCommit = () => {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}) {
  const configured = [
    env.AI360_DEPLOYMENT_ID_OVERRIDE,
    env.GITHUB_SHA,
    env.CI_COMMIT_SHA,
    env.COMMIT_SHA,
  ].map(safeReleaseId).find(Boolean)
  if (configured) return configured

  try {
    const commit = safeReleaseId(readGitCommit())
    if (commit) return commit
  } catch {
    // File-upload deployments may not include Git metadata. A unique ID still
    // keeps this build internally consistent and is persisted for `next start`.
  }
  return `build-${Date.now().toString(36)}`
}

// The Sentry wizard stores the source-map upload token in
// .env.sentry-build-plugin (gitignored). withSentryConfig reads
// SENTRY_AUTH_TOKEN from the environment at build time, so load that file
// when the token isn't already set. Without it the build still succeeds and
// simply skips source-map upload.
function loadSentryBuildEnv(env, root) {
  if (env.SENTRY_AUTH_TOKEN) return
  try {
    const raw = readFileSync(resolve(root, '.env.sentry-build-plugin'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.trim().match(/^([A-Z0-9_]+)=(.*)$/)
      if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // No token file — source maps are skipped, the build still succeeds.
  }
}

export function runBuild(env = process.env) {
  const deploymentId = resolveDeploymentId(env)
  const root = resolve(import.meta.dirname, '..')
  loadSentryBuildEnv(env, root)
  writeFileSync(resolve(root, '.deployment-id'), `${deploymentId}\n`, 'utf8')
  console.log(`Building deployment ${deploymentId}`)

  const nextCli = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  const result = spawnSync(process.execPath, [nextCli, 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...env,
      NODE_OPTIONS: [env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' '),
      NEXT_DEPLOYMENT_ID: deploymentId,
    },
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runBuild()
}
