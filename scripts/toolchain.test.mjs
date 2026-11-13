import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import parser from '@typescript-eslint/parser';

const source = 'export const answer: number = 42;';
let directory;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'iccp-parser-'));
  for (const name of ['src/main.ts', 'tool.config.ts', '.hidden.config.ts', 'outside.ts', 'nested/tool.config.ts']) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true }, include: ['src/**/*.ts'],
  }));
});

afterAll(() => {
  parser.clearCaches();
  rmSync(directory, { recursive: true, force: true });
});

const parse = (name) => parser.parseForESLint(source, {
  filePath: join(directory, name),
  tsconfigRootDir: directory,
  projectService: { allowDefaultProject: ['*.config.ts'], defaultProject: 'tsconfig.json' },
});

describe('ESLint project-service compatibility with the patched glob dependency', () => {
  it.each(['tool.config.ts', '.hidden.config.ts'])('provides type information for an allowed config file: %s', (name) => {
    const { ast, services } = parse(name);
    expect(ast.type).toBe('Program');
    expect(services.program.getCompilerOptions().strict).toBe(true);
    expect(services.program.getSourceFile(join(directory, name)).getFullText()).toBe(source);
  });

  it.each(['outside.ts', 'nested/tool.config.ts'])('rejects a file outside the configured allowlist: %s', (name) => {
    expect(() => parse(name)).toThrow(/was not found by the project service/);
  });
});
