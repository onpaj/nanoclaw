/**
 * Smoke test for MS365 skill installation.
 * Verifies that the required changes are present in the modified files.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

describe('add-ms365 skill', () => {
  it('Dockerfile includes @softeria/ms-365-mcp-server', () => {
    const dockerfile = fs.readFileSync(path.join(projectRoot, 'container/Dockerfile'), 'utf-8');
    expect(dockerfile).toContain('@softeria/ms-365-mcp-server');
  });

  it('agent-runner index.ts includes mcp__ms365__* in allowedTools', () => {
    const indexTs = fs.readFileSync(
      path.join(projectRoot, 'container/agent-runner/src/index.ts'), 'utf-8'
    );
    expect(indexTs).toContain("'mcp__ms365__*'");
  });

  it('agent-runner index.ts includes ms365 mcpServer config', () => {
    const indexTs = fs.readFileSync(
      path.join(projectRoot, 'container/agent-runner/src/index.ts'), 'utf-8'
    );
    expect(indexTs).toContain('ms365:');
    expect(indexTs).toContain('ms-365-mcp-server');
    expect(indexTs).toContain('MS365_CLIENT_ID');
  });

  it('container-runner.ts passes MS365 secrets', () => {
    const containerRunner = fs.readFileSync(
      path.join(projectRoot, 'src/container-runner.ts'), 'utf-8'
    );
    expect(containerRunner).toContain("'MS365_CLIENT_ID'");
    expect(containerRunner).toContain("'MS365_CLIENT_SECRET'");
    expect(containerRunner).toContain("'MS365_TENANT_ID'");
  });

  it('project builds cleanly', () => {
    expect(() => execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' })).not.toThrow();
  });
});
