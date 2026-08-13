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

export function runBuild(env = process.env) {
  const deploymentId = resolveDeploymentId(env)
  const root = resolve(import.meta.dirname, '..')
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
