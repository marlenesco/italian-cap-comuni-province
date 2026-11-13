import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkVersionChange, packRelease, runReleaseCommand, validatePackage, versionExists } from './release.mjs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));

describe('Scoped release preparation', () => {
  it('accepts matching personal package, repository, public registry and lockfile metadata', () => {
    expect(() => validatePackage(manifest, lock)).not.toThrow();
    expect(manifest.name).toBe('@marlenesco/italian-cap-comuni-province');
    expect(manifest.dependencies || {}).toEqual({});
  });

  it.each([
    { name: 'italian-cap-comuni-province' },
    { name: '@company/italian-cap-comuni-province' },
    { version: '1.2.0-beta.1' },
    { version: '01.2.0' },
    { repository: { url: 'git+https://github.com/spritzcoder/italian-cap-comuni-province.git' } },
    { publishConfig: { access: 'restricted', registry: 'https://registry.npmjs.org/' } },
    { publishConfig: { access: 'public', registry: 'https://npm.pkg.github.com/' } },
  ])('rejects an unexpected release identity or destination: %j', (changes) => {
    expect(() => validatePackage({ ...manifest, ...changes }, lock)).toThrow();
  });

  it('rejects inconsistent root and nested lockfile metadata', () => {
    for (const changed of [{ ...lock, version: '0.0.0' }, { ...lock, packages: { '': { ...manifest, name: 'other' } } }, { ...lock, packages: {} }]) {
      expect(() => validatePackage(manifest, changed)).toThrow(/lockfile/);
    }
  });

  it.each(['src/data/gi_comuni_cap.json', 'src/index.ts', 'scripts/data/build.mjs', 'scripts/data/schema.mjs', 'tsup.config.ts', 'package.json', 'LICENSE'])('requires a newer version for changes to %s', (path) => {
    expect(() => checkVersionChange(manifest, manifest, [path])).toThrow(/newer package version/);
    expect(() => checkVersionChange(manifest, { version: '1.1.99' }, [path])).not.toThrow();
  });

  it('compares version components numerically and allows documentation-only merges', () => {
    expect(() => checkVersionChange({ version: '1.10.0' }, { version: '1.9.9' }, ['src/index.ts'])).not.toThrow();
    for (const version of ['1.2.0', '2.0.0', 'invalid']) {
      expect(() => checkVersionChange({ version: '1.2.0' }, { version }, ['src/index.ts'])).toThrow();
    }
    expect(() => checkVersionChange(manifest, manifest, ['README.md', 'docs/releasing.md', 'src/test/index.test.ts', '.github/workflows/npm-release.yml'])).not.toThrow();
  });

  it('distinguishes a new version from an already public version with bounded registry requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: manifest.name, version: manifest.version })));
    expect(await versionExists(manifest, fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${manifest.version}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    fetcher.mockResolvedValue(new Response('Not found', { status: 404 }));
    expect(await versionExists(manifest, fetcher)).toBe(false);
  });

  it.each([401, 403, 429, 500, 503])('does not treat HTTP %s as permission to publish', async (status) => {
    const cancel = vi.fn();
    await expect(versionExists(manifest, vi.fn().mockResolvedValue({ ok: false, status, body: { cancel } }))).rejects.toThrow(`HTTP ${status}`);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('fails closed on timeout, malformed JSON and mismatched registry metadata', async () => {
    await expect(versionExists(manifest, vi.fn().mockRejectedValue(new Error('Timed out')))).rejects.toThrow('Timed out');
    for (const response of [new Response('invalid'), new Response('{"name":"other","version":"1.2.0"}'), new Response(JSON.stringify({ name: manifest.name, version: '0.0.0' }))]) {
      await expect(versionExists(manifest, vi.fn().mockResolvedValue(response))).rejects.toThrow();
    }
  });

  it('packs without publication and retains npm integrity metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'iccp-release-test-'));
    const packed = { name: manifest.name, version: manifest.version, filename: 'scoped-package.tgz', integrity: 'sha512-example', files: [] };
    const run = vi.fn().mockReturnValue(`prepack output\n${JSON.stringify([packed], null, 2)}`);
    try {
      expect(packRelease(manifest, directory, run)).toBe('scoped-package.tgz');
      expect(run).toHaveBeenCalledOnce();
      expect(run).toHaveBeenCalledWith('npm', ['pack', '--json', '--pack-destination', directory]);
      expect(JSON.parse(readFileSync(join(directory, 'pack.json')))).toEqual(packed);
      for (const changes of [{ name: 'other' }, { version: '0.0.0' }, { filename: '../other.tgz' }, { filename: 'other.js' }, { filename: null }]) {
        run.mockReturnValue(JSON.stringify([{ ...packed, ...changes }], null, 2));
        expect(() => packRelease(manifest, directory, run)).toThrow(/Unexpected packed/);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('dispatches preparation commands and emits bounded GitHub step outputs without publishing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'iccp-release-cli-'));
    const outputFile = join(directory, 'outputs');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const packed = { name: manifest.name, version: manifest.version, filename: 'scoped-package.tgz' };
    const run = vi.fn((command, args) => {
      if (command === 'npm') return JSON.stringify([packed], null, 2);
      return args[0] === 'show' ? JSON.stringify({ version: '1.1.1' }) : 'src/index.ts\n';
    });
    vi.stubEnv('GITHUB_OUTPUT', outputFile);
    try {
      await runReleaseCommand(['pack', directory], run);
      await runReleaseCommand(['status'], run, vi.fn().mockResolvedValue(new Response('', { status: 404 })));
      expect(readFileSync(outputFile, 'utf8')).toBe(`filename=scoped-package.tgz\nversion=${manifest.version}\nexists=false\n`);
      await runReleaseCommand(['check-version', 'a'.repeat(40)], run);
      expect(run).toHaveBeenCalledWith('git', ['show', `${'a'.repeat(40)}:package.json`]);
      expect(run).toHaveBeenCalledWith('git', ['diff', '--name-only', `${'a'.repeat(40)}...HEAD`]);
      for (const args of [[], ['publish'], ['pack'], ['check-version', '--invalid']]) {
        await expect(runReleaseCommand(args, run)).rejects.toThrow('Usage:');
      }
      expect(run.mock.calls.some(([command, args]) => command === 'npm' && args.includes('publish'))).toBe(false);
      vi.unstubAllEnvs();
      await runReleaseCommand(['status'], run, vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    } finally {
      vi.unstubAllEnvs(); log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
