import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { tables } from './schema.mjs';

const sourceFiles = tables.map((name) => `src/data/${name}.json`);
const provenanceFile = 'src/data/provenance.json';
const execute = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const comparable = (metadata) => {
  const copy = { ...metadata };
  delete copy.acquiredAt;
  return copy;
};

// Keep an existing proposal or maintainer rejection intact. Recover a push whose
// PR creation was interrupted only when its data and provenance still match.
export function proposeUpdate({ repository, baseBranch, reportPath, provenance }, run = execute, log = console.log) {
  if (!repository || !baseBranch || !reportPath || !/^[a-f\d]{64}$/.test(provenance?.archiveSha256)) {
    throw new Error('Repository, base branch, report path and archive SHA-256 are required');
  }
  const branch = `automation/garda-${provenance.archiveSha256.slice(0, 12)}`;
  const proposals = JSON.parse(run('gh', ['pr', 'list', '--repo', repository, '--head', branch, '--base', baseBranch, '--state', 'all', '--json', 'number,state']));
  if (proposals.length) {
    const existing = proposals.find((pr) => pr.state === 'OPEN') || proposals[0];
    log(`Keeping existing dataset PR #${existing.number} (${existing.state}); branch left unchanged.`);
    return { action: 'existing', branch, ...existing };
  }

  const ref = `refs/heads/${branch}`;
  const remote = run('git', ['ls-remote', '--heads', 'origin', ref]).trim();
  if (remote) {
    const [sha, remoteRef, extra] = remote.split(/\s+/);
    if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/.test(sha) || remoteRef !== ref || extra) throw new Error('Unexpected existing dataset branch');
    run('git', ['fetch', '--no-tags', 'origin', branch]);
    if (run('git', ['rev-parse', 'FETCH_HEAD']).trim() !== sha) throw new Error('Dataset branch changed during inspection; retry after reviewing its head');
    const changed = run('git', ['diff', '--name-only', 'HEAD...FETCH_HEAD']).trim().split('\n').filter(Boolean);
    if (changed.some((path) => ![...sourceFiles, provenanceFile].includes(path))) throw new Error('Existing dataset branch contains other changes; review it manually');
    run('git', ['diff', '--quiet', 'FETCH_HEAD', '--', ...sourceFiles]);
    const previous = JSON.parse(run('git', ['show', `FETCH_HEAD:${provenanceFile}`]));
    if (!isDeepStrictEqual(comparable(previous), comparable(provenance))) throw new Error('Existing dataset branch provenance differs; review it manually');
    log('Recovering a validated dataset branch without overwriting its commits.');
  } else {
    run('git', ['switch', '-c', branch]);
    run('git', ['config', 'user.name', 'github-actions[bot]']);
    run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    run('git', ['add', '--', ...sourceFiles, provenanceFile]);
    run('git', ['commit', '-m', 'Update Garda Informatica geographic datasets']);
    run('git', ['push', 'origin', `HEAD:${ref}`]);
  }
  const url = run('gh', ['pr', 'create', '--repo', repository, '--base', baseBranch, '--head', branch, '--title', 'Update Garda Informatica geographic datasets', '--body-file', reportPath]).trim();
  log(`Created dataset PR: ${url}`);
  return { action: 'created', branch, url, reusedBranch: Boolean(remote) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    proposeUpdate({
      repository: process.env.REPOSITORY,
      baseBranch: process.env.DEFAULT_BRANCH,
      reportPath: process.env.RUNNER_TEMP ? join(process.env.RUNNER_TEMP, 'dataset-report.json.md') : '',
      provenance: JSON.parse(readFileSync(provenanceFile, 'utf8')),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
