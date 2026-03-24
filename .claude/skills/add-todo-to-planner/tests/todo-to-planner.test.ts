import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('todo-to-planner skill package', () => {
  const skillDir = path.resolve(__dirname, '..');

  it('has a valid manifest', () => {
    const manifestPath = path.join(skillDir, 'manifest.yaml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('skill: add-todo-to-planner');
    expect(content).toContain('version: 1.0.0');
  });

  it('has all files declared in adds', () => {
    const script = path.join(
      skillDir,
      'add',
      'container',
      'skills',
      'todo-to-planner',
      'migrate.mjs',
    );
    expect(fs.existsSync(script)).toBe(true);

    const content = fs.readFileSync(script, 'utf-8');
    expect(content).toContain('graph.microsoft.com');
    expect(content).toContain('/me/todo/lists');
    expect(content).toContain('/planner/tasks');
    expect(content).toContain('linkedResources');
    expect(content).toContain('TOKEN_CACHE_PATH');

    const agentDocs = path.join(
      skillDir,
      'add',
      'container',
      'skills',
      'todo-to-planner',
      'SKILL.md',
    );
    expect(fs.existsSync(agentDocs)).toBe(true);

    const docsContent = fs.readFileSync(agentDocs, 'utf-8');
    expect(docsContent).toContain('migrate.mjs');
    expect(docsContent).toContain('--dry-run');
  });

  it('has setup documentation', () => {
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
  });

  it('migration script handles core operations', () => {
    const content = fs.readFileSync(
      path.join(
        skillDir,
        'add',
        'container',
        'skills',
        'todo-to-planner',
        'migrate.mjs',
      ),
      'utf-8',
    );

    // Auth: token cache reuse
    expect(content).toContain('.token-cache.json');
    expect(content).toContain('.selected-account.json');
    expect(content).toContain('refresh_token');
    expect(content).toContain('grant_type');

    // To Do operations
    expect(content).toContain('/me/todo/lists');
    expect(content).toContain('isPersonalTask');
    expect(content).toContain('linkedResources');

    // Planner operations
    expect(content).toContain('/planner/tasks');
    expect(content).toContain('/planner/plans');
    expect(content).toContain('bucketId');
    expect(content).toContain('percentComplete');

    // Task field mapping
    expect(content).toContain('mapPriority');
    expect(content).toContain('mapPercentComplete');
    expect(content).toContain('dueDateTime');

    // Error handling
    expect(content).toContain('catch');
    expect(content).toContain('FAILED');

    // CLI flags
    expect(content).toContain('--dry-run');
    expect(content).toContain('--plan-id');
    expect(content).toContain('--list');

    // Pagination
    expect(content).toContain('@odata.nextLink');

    // Rate limiting
    expect(content).toContain('setTimeout');
  });

  it('declares no modifies (standalone skill)', () => {
    const content = fs.readFileSync(
      path.join(skillDir, 'manifest.yaml'),
      'utf-8',
    );
    expect(content).toContain('modifies: []');
  });
});
