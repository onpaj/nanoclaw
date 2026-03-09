import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('icloud-caldav skill package', () => {
  const skillDir = path.resolve(__dirname, '..');

  it('has a valid manifest', () => {
    const manifestPath = path.join(skillDir, 'manifest.yaml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf-8');
    expect(content).toContain('skill: add-icloud-caldav');
    expect(content).toContain('version: 1.0.0');
    expect(content).toContain('APPLE_ID');
    expect(content).toContain('APPLE_APP_PASS');
  });

  it('has all files declared in adds', () => {
    const cliScript = path.join(
      skillDir,
      'add',
      'container',
      'skills',
      'icloud-caldav',
      'icloud-cal',
    );
    expect(fs.existsSync(cliScript)).toBe(true);

    const content = fs.readFileSync(cliScript, 'utf-8');
    expect(content).toContain('#!/usr/bin/env node');
    expect(content).toContain('DAVClient');
    expect(content).toContain('ICAL');
    expect(content).toContain('APPLE_ID');
    expect(content).toContain('APPLE_APP_PASS');

    const agentDocs = path.join(
      skillDir,
      'add',
      'container',
      'skills',
      'icloud-caldav',
      'SKILL.md',
    );
    expect(fs.existsSync(agentDocs)).toBe(true);

    const docsContent = fs.readFileSync(agentDocs, 'utf-8');
    expect(docsContent).toContain('icloud-cal');
    expect(docsContent).toContain('list-calendars');
  });

  it('has all files declared in modifies', () => {
    const dockerfile = path.join(
      skillDir,
      'modify',
      'container',
      'Dockerfile',
    );
    expect(fs.existsSync(dockerfile)).toBe(true);

    const dockerContent = fs.readFileSync(dockerfile, 'utf-8');
    expect(dockerContent).toContain('tsdav');
    expect(dockerContent).toContain('ical.js');
    expect(dockerContent).toContain('icloud-cal');

    const containerRunner = path.join(
      skillDir,
      'modify',
      'src',
      'container-runner.ts',
    );
    expect(fs.existsSync(containerRunner)).toBe(true);

    const runnerContent = fs.readFileSync(containerRunner, 'utf-8');
    expect(runnerContent).toContain("'APPLE_ID'");
    expect(runnerContent).toContain("'APPLE_APP_PASS'");
  });

  it('has intent files for modified files', () => {
    expect(
      fs.existsSync(
        path.join(skillDir, 'modify', 'container', 'Dockerfile.intent.md'),
      ),
    ).toBe(true);

    expect(
      fs.existsSync(
        path.join(
          skillDir,
          'modify',
          'src',
          'container-runner.ts.intent.md',
        ),
      ),
    ).toBe(true);
  });

  it('has setup documentation', () => {
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
  });

  it('icloud-cal script handles all required commands', () => {
    const content = fs.readFileSync(
      path.join(
        skillDir,
        'add',
        'container',
        'skills',
        'icloud-caldav',
        'icloud-cal',
      ),
      'utf-8',
    );

    // Commands
    expect(content).toContain("'list-calendars'");
    expect(content).toContain("'today'");
    expect(content).toContain("'tomorrow'");
    expect(content).toContain("'week'");
    expect(content).toContain("'events'");

    // CalDAV connection
    expect(content).toContain('caldav.icloud.com');
    expect(content).toContain("authMethod: 'Basic'");

    // ICS parsing
    expect(content).toContain('ICAL.parse');
    expect(content).toContain('ICAL.Component');
    expect(content).toContain('ICAL.Event');

    // Recurring event expansion with safety limit
    expect(content).toContain('isRecurring');
    expect(content).toContain('500');

    // Output format fields
    expect(content).toContain('title');
    expect(content).toContain('allDay');
    expect(content).toContain('recurring');
    expect(content).toContain('location');
  });
});
