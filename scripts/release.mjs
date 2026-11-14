import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const packageName = '@marlenesco/italian-cap-comuni-province';
const repository = 'git+https://github.com/marlenesco/italian-cap-comuni-province.git';
const registry = 'https://registry.npmjs.org/';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const execute = (command, args) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});

export function validatePackage(manifest, lock) {
  if (manifest.name !== packageName || !stableVersion.test(manifest.version)) {
    throw new Error('Only stable versions of the personal scoped package may be released');
  }
  if (manifest.repository?.url !== repository || manifest.publishConfig?.registry !== registry || manifest.publishConfig?.access !== 'public') {
    throw new Error('The fork repository and public npm registry must match the release configuration');
  }
  if ([lock, lock.packages?.['']].some((entry) => entry?.name !== manifest.name || entry?.version !== manifest.version)) {
    throw new Error('Package and lockfile identities must match');
  }
}

function releaseMetadata(manifest) {
  const metadata = { ...manifest, scripts: { ...manifest.scripts } };
  delete metadata.devDependencies;
  delete metadata.overrides;
  delete metadata.scripts.audit;
  return metadata;
}

export function checkVersionChange(manifest, base, paths) {
  // Development dependency maintenance alone does not create a new library release.
  const sourceChanged = paths.some((path) => /^(src\/(?!test\/|generated\/)|scripts\/data\/(build|schema)\.mjs$|tsup\.config\.ts$|LICENSE$)/.test(path));
  const metadataChanged = paths.includes('package.json')
    && !isDeepStrictEqual(releaseMetadata(manifest), releaseMetadata(base));
  if (!sourceChanged && !metadataChanged) return;
  const newer = stableVersion.test(base.version) && manifest.version.split('.').map(Number)
    .reduce((comparison, value, index) => comparison || Math.sign(value - Number(base.version.split('.')[index])), 0) > 0;
  if (!newer) throw new Error('Changes to distributed files require a newer package version in the PR');
}

export async function versionExists(manifest, fetcher = fetch) {
  const response = await fetcher(`${registry}${encodeURIComponent(manifest.name)}/${manifest.version}`, {
    signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) return false;
    throw new Error(`npm registry lookup failed (HTTP ${response.status}); refusing to publish`);
  }
  const published = await response.json();
  if (published.name !== manifest.name || published.version !== manifest.version) throw new Error('Unexpected npm registry metadata');
  return true;
}

export function packRelease(manifest, directory, run = execute) {
  mkdirSync(directory, { recursive: true });
  const output = run('npm', ['pack', '--json', '--pack-destination', directory]);
  // prepack lifecycle output precedes the JSON result on some npm versions.
  const result = JSON.parse(output.slice(output.indexOf('[\n')));
  const packed = result[0];
  if (result.length !== 1 || packed.name !== manifest.name || packed.version !== manifest.version
      || typeof packed.filename !== 'string' || basename(packed.filename) !== packed.filename || !packed.filename.endsWith('.tgz')) {
    throw new Error('Unexpected packed package identity or filename');
  }
  // Keep the npm-generated integrity and inventory alongside the CI artifact.
  writeFileSync(join(directory, 'pack.json'), `${JSON.stringify(packed, null, 2)}\n`);
  return packed.filename;
}

export async function runReleaseCommand([command, argument], run = execute, fetcher = fetch) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  validatePackage(manifest, lock);
  let outputs;
  if (command === 'check-version' && /^[a-f\d]{40}$/.test(argument || '')) {
    const base = JSON.parse(run('git', ['show', `${argument}:package.json`]));
    const paths = run('git', ['diff', '--name-only', `${argument}...HEAD`]).trim().split('\n');
    checkVersionChange(manifest, base, paths);
    console.log('Release version policy passed.');
    return;
  } else if (command === 'pack' && argument) {
    outputs = { filename: packRelease(manifest, resolve(argument), run), version: manifest.version };
  } else if (command === 'status') {
    outputs = { exists: await versionExists(manifest, fetcher) };
  } else {
    throw new Error('Usage: node scripts/release.mjs pack DIRECTORY | status | check-version BASE_SHA');
  }
  for (const [key, value] of Object.entries(outputs)) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReleaseCommand(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
