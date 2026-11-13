import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { proposeUpdate } from './propose-pr.mjs';

const metadata = { archiveSha256: 'a'.repeat(64), acquiredAt: '2026-11-13T00:00:00Z', sourceDate: '2026-11-06', datasets: { gi_regioni: { records: 20 } } };
const options = { repository: 'example/locations', baseBranch: 'main', reportPath: '/tmp/dataset-report.md', provenance: metadata };
const branch = 'automation/garda-aaaaaaaaaaaa';
const sha = 'b'.repeat(40);
const url = 'https://github.com/example/locations/pull/12';

function commands({ proposals = [], remote = false, paths = 'src/data/gi_regioni.json\nsrc/data/provenance.json', provenance = { ...metadata, acquiredAt: '2026-11-12T00:00:00Z' }, fetchedSha = sha, dataDiffer = false, failCreate = false } = {}) {
  return vi.fn((command, args) => {
    if (command === 'gh' && args[1] === 'list') return JSON.stringify(proposals);
    if (command === 'git' && args[0] === 'ls-remote') return remote ? `${sha}\trefs/heads/${branch}\n` : '';
    if (command === 'git' && args[0] === 'rev-parse') return fetchedSha;
    if (command === 'git' && args[1] === '--name-only') return paths;
    if (command === 'git' && args[1] === '--quiet' && dataDiffer) throw new Error('Different source bytes');
    if (command === 'git' && args[0] === 'show') return JSON.stringify(provenance);
    if (command === 'gh' && args[1] === 'create') {
      if (failCreate) throw new Error('PR request interrupted');
      return url;
    }
    return '';
  });
}
const mutations = (run) => run.mock.calls.filter(([command, args]) => command === 'git' && ['switch', 'config', 'add', 'commit', 'push'].includes(args[0]));

describe('Dataset update proposals', () => {
  it('creates one dedicated branch and PR with explicit files and a body file', () => {
    const run = commands();
    expect(proposeUpdate(options, run, vi.fn())).toEqual({ action: 'created', branch, url, reusedBranch: false });
    expect(run).toHaveBeenCalledWith('git', ['push', 'origin', `HEAD:refs/heads/${branch}`]);
    expect(run).toHaveBeenCalledWith('git', ['add', '--', 'src/data/gi_comuni_cap.json', 'src/data/gi_province.json', 'src/data/gi_regioni.json', 'src/data/provenance.json', 'package.json', 'package-lock.json']);
    expect(run).toHaveBeenCalledWith('gh', expect.arrayContaining(['--repo', 'example/locations', '--base', 'main', '--head', branch, '--body-file', '/tmp/dataset-report.md']));
    expect(run.mock.calls.flat(2)).not.toContain('--force');
  });

  it.each(['OPEN', 'CLOSED', 'MERGED'])('respects an existing %s proposal without changing its branch', (state) => {
    const run = commands({ proposals: [{ number: 12, state }] });
    expect(proposeUpdate(options, run, vi.fn())).toEqual({ action: 'existing', branch, number: 12, state });
    expect(run).toHaveBeenCalledTimes(1);
    expect(mutations(run)).toHaveLength(0);
  });

  it('prefers the existing open proposal when older closed proposals also exist', () => {
    const run = commands({ proposals: [{ number: 10, state: 'CLOSED' }, { number: 12, state: 'OPEN' }] });
    expect(proposeUpdate(options, run, vi.fn()).number).toBe(12);
  });

  it('recovers a branch pushed before PR creation failed, preserving acquisition metadata and commits', () => {
    const first = commands({ failCreate: true });
    expect(() => proposeUpdate(options, first, vi.fn())).toThrow(/interrupted/);
    expect(first).toHaveBeenCalledWith('git', ['push', 'origin', `HEAD:refs/heads/${branch}`]);
    const retry = commands({ remote: true });
    expect(proposeUpdate(options, retry, vi.fn())).toEqual({ action: 'created', branch, url, reusedBranch: true });
    expect(mutations(retry)).toHaveLength(0);
    expect(retry).toHaveBeenCalledWith('git', ['diff', '--quiet', 'FETCH_HEAD', '--', 'src/data/gi_comuni_cap.json', 'src/data/gi_province.json', 'src/data/gi_regioni.json', 'package.json', 'package-lock.json']);
  });

  it.each([
    { paths: 'src/index.ts', message: /other changes/ },
    { paths: 'package.json\npackage-lock.json', dataDiffer: true, message: /Different source bytes/ },
    { provenance: { ...metadata, sourceDate: '2026-01-01' }, message: /provenance differs/ },
    { fetchedSha: 'c'.repeat(40), message: /changed during inspection/ },
    { dataDiffer: true, message: /Different source bytes/ },
  ])('leaves a changed or inconsistent existing branch untouched', ({ message, ...scenario }) => {
    const run = commands({ remote: true, ...scenario });
    expect(() => proposeUpdate(options, run, vi.fn())).toThrow(message);
    expect(mutations(run)).toHaveLength(0);
    expect(run.mock.calls.some(([command, args]) => command === 'gh' && args[1] === 'create')).toBe(false);
  });

  it('rejects missing configuration and malformed remote refs before writing', () => {
    for (const overrides of [{ repository: '' }, { baseBranch: '' }, { reportPath: '' }, { provenance: {} }]) {
      const run = commands();
      expect(() => proposeUpdate({ ...options, ...overrides }, run, vi.fn())).toThrow(/required/);
      expect(run).not.toHaveBeenCalled();
    }
    const run = commands();
    run.mockImplementation((command, args) => command === 'gh' ? '[]' : 'not a remote ref');
    expect(() => proposeUpdate(options, run, vi.fn())).toThrow(/Unexpected/);
    expect(mutations(run)).toHaveLength(0);
  });

  it('reports missing CLI configuration without invoking GitHub', async () => {
    const previousArgv = process.argv;
    const previousExitCode = process.exitCode;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('REPOSITORY', ''); vi.stubEnv('DEFAULT_BRANCH', ''); vi.stubEnv('RUNNER_TEMP', '');
    process.argv = [process.execPath, resolve('scripts/data/propose-pr.mjs')];
    try {
      await import('./propose-pr.mjs?cli-invalid-config');
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('are required'));
    } finally {
      process.argv = previousArgv;
      process.exitCode = previousExitCode;
      vi.unstubAllEnvs();
      error.mockRestore();
    }
  });

  it('recovers an interrupted proposal with real Git after the default branch advances', () => {
    const directory = mkdtempSync(join(tmpdir(), 'iccp-proposal-test-'));
    const origin = join(directory, 'origin.git');
    const work = join(directory, 'work');
    const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      mkdirSync(work);
      git('init', '--bare', '--initial-branch=main', origin);
      git('init', '--initial-branch=main');
      git('config', 'user.name', 'Dataset test');
      git('config', 'user.email', 'dataset-test@example.invalid');
      git('remote', 'add', 'origin', origin);
      mkdirSync(join(work, 'src/data'), { recursive: true });
      const files = ['gi_comuni_cap', 'gi_province', 'gi_regioni'];
      for (const file of files) writeFileSync(join(work, 'src/data', `${file}.json`), '[]');
      writeFileSync(join(work, 'src/data/provenance.json'), JSON.stringify({ archiveSha256: null }));
      for (const file of ['package.json', 'package-lock.json']) writeFileSync(join(work, file), '{"version":"1.2.0"}');
      git('add', '.'); git('commit', '-m', 'Initial fixture'); git('push', 'origin', 'main');
      const candidate = (provenance) => {
        for (const file of ['package.json', 'package-lock.json']) writeFileSync(join(work, file), '{"version":"1.2.1"}');
        for (const file of files) writeFileSync(join(work, 'src/data', `${file}.json`), '["candidate"]');
        writeFileSync(join(work, 'src/data/provenance.json'), JSON.stringify(provenance));
      };
      const run = (fail) => (command, args) => {
        if (command === 'git') return git(...args);
        if (args[1] === 'list') return '[]';
        if (fail) throw new Error('PR request interrupted');
        return url;
      };
      candidate(metadata);
      expect(() => proposeUpdate(options, run(true), vi.fn())).toThrow(/interrupted/);
      const existingHead = git('rev-parse', branch).trim();
      git('switch', 'main');
      writeFileSync(join(work, 'README.md'), 'A later change on main.');
      git('add', 'README.md'); git('commit', '-m', 'Advance main'); git('push', 'origin', 'main');
      const latestMetadata = { ...metadata, acquiredAt: '2026-11-14T00:00:00Z' };
      candidate(latestMetadata);
      expect(proposeUpdate({ ...options, provenance: latestMetadata }, run(false), vi.fn()).reusedBranch).toBe(true);
      expect(git('rev-parse', `refs/remotes/origin/${branch}`).trim()).toBe(existingHead);
      expect(git('branch', '--show-current').trim()).toBe('main');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
