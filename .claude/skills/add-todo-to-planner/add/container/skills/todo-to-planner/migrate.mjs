#!/usr/bin/env node

/**
 * Microsoft To Do → Planner migration script.
 *
 * Reads personal tasks from To Do (those without a linked Planner resource),
 * creates matching tasks in the "Personal" Planner plan, then deletes the
 * originals from To Do.
 *
 * Auth: reuses the MS365 MCP server's MSAL token cache.
 *
 * Usage:
 *   node migrate.mjs                     # migrate all personal tasks
 *   node migrate.mjs --dry-run           # preview without changes
 *   node migrate.mjs --plan-id <id>      # use specific plan ID
 *   node migrate.mjs --list "Shopping"   # only migrate from this To Do list
 */

import fs from 'fs';

const TOKEN_CACHE_PATH = '/workspace/ms365-cache/.token-cache.json';
const SELECTED_ACCOUNT_PATH = '/workspace/ms365-cache/.selected-account.json';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';
const TARGET_PLAN_NAME = 'Personal';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PLAN_ID_ARG = args.includes('--plan-id')
  ? args[args.indexOf('--plan-id') + 1]
  : null;
const LIST_FILTER = args.includes('--list')
  ? args[args.indexOf('--list') + 1]
  : null;

function log(msg) {
  console.error(`[migrate] ${msg}`);
}

// ---------------------------------------------------------------------------
// Auth — reuse MSAL token cache from MS365 MCP server
// ---------------------------------------------------------------------------

async function getAccessToken() {
  if (!fs.existsSync(TOKEN_CACHE_PATH)) {
    throw new Error(
      `Token cache not found at ${TOKEN_CACHE_PATH}. ` +
        'Ensure the MS365 MCP server has authenticated at least once.',
    );
  }

  const cache = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8'));

  // Determine selected account (multi-account support)
  let selectedHomeId = null;
  if (fs.existsSync(SELECTED_ACCOUNT_PATH)) {
    try {
      const sel = JSON.parse(fs.readFileSync(SELECTED_ACCOUNT_PATH, 'utf-8'));
      selectedHomeId = sel.homeAccountId || sel.home_account_id || null;
    } catch {
      /* ignore */
    }
  }

  // Try cached access token first (if still valid)
  if (cache.AccessToken) {
    for (const entry of Object.values(cache.AccessToken)) {
      if (selectedHomeId && entry.home_account_id !== selectedHomeId) continue;
      const expiresOn = parseInt(entry.expires_on, 10) * 1000;
      if (expiresOn > Date.now() + 60_000) {
        log('Using cached access token (still valid)');
        return entry.secret;
      }
    }
  }

  // Fall back to refresh token
  log('Access token expired, refreshing...');
  const refreshEntry = cache.RefreshToken
    ? Object.values(cache.RefreshToken).find(
        (rt) => !selectedHomeId || rt.home_account_id === selectedHomeId,
      )
    : null;

  if (!refreshEntry) {
    throw new Error(
      'No refresh token found in cache. Re-authenticate the MS365 MCP server.',
    );
  }

  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing MS365_TENANT_ID, MS365_CLIENT_ID, or MS365_CLIENT_SECRET in environment.',
    );
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshEntry.secret,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  );

  const data = await resp.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  // Update cache with new tokens so the MCP server stays happy
  if (data.refresh_token && refreshEntry) {
    refreshEntry.secret = data.refresh_token;
  }
  if (data.access_token && cache.AccessToken) {
    for (const entry of Object.values(cache.AccessToken)) {
      if (selectedHomeId && entry.home_account_id !== selectedHomeId) continue;
      entry.secret = data.access_token;
      entry.expires_on = String(
        Math.floor((Date.now() + (data.expires_in || 3600) * 1000) / 1000),
      );
      break;
    }
  }
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2));

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Graph API helpers
// ---------------------------------------------------------------------------

async function graphGet(token, path, useBeta = false) {
  const base = useBeta ? GRAPH_BETA : GRAPH_BASE;
  const resp = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GET ${path} failed (${resp.status}): ${body}`);
  }
  return resp.json();
}

async function graphPost(token, path, body) {
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`POST ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

async function graphPatch(token, path, body, etag) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (etag) headers['If-Match'] = etag;
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PATCH ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

async function graphDelete(token, path) {
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text();
    throw new Error(`DELETE ${path} failed (${resp.status}): ${text}`);
  }
}

/**
 * Paginated GET — follows @odata.nextLink until all pages are collected.
 */
async function graphGetAll(token, path, useBeta = false) {
  const items = [];
  let url = `${useBeta ? GRAPH_BETA : GRAPH_BASE}${path}`;
  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`GET ${path} failed (${resp.status}): ${body}`);
    }
    const data = await resp.json();
    items.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Find Planner plan
// ---------------------------------------------------------------------------

async function findPlan(token, planName) {
  if (PLAN_ID_ARG) {
    log(`Using provided plan ID: ${PLAN_ID_ARG}`);
    const plan = await graphGet(token, `/planner/plans/${PLAN_ID_ARG}`);
    return plan;
  }

  log(`Searching for Planner plan "${planName}"...`);

  // Method 1: Search through user's groups
  try {
    const groups = await graphGetAll(
      token,
      '/me/memberOf/microsoft.graph.group?$select=id,displayName&$top=100',
    );
    for (const group of groups) {
      try {
        const plans = await graphGetAll(
          token,
          `/groups/${group.id}/planner/plans?$select=id,title`,
        );
        const found = plans.find(
          (p) => p.title.toLowerCase() === planName.toLowerCase(),
        );
        if (found) {
          log(`Found plan "${found.title}" (${found.id}) in group "${group.displayName}"`);
          return found;
        }
      } catch {
        // Group might not have Planner enabled, skip
      }
    }
  } catch (err) {
    log(`Group search failed: ${err.message}`);
  }

  // Method 2: Try beta endpoint for roster-based plans
  try {
    const plans = await graphGetAll(token, '/me/planner/plans', true);
    const found = plans.find(
      (p) => p.title.toLowerCase() === planName.toLowerCase(),
    );
    if (found) {
      log(`Found roster plan "${found.title}" (${found.id})`);
      return found;
    }
  } catch (err) {
    log(`Beta plan search failed: ${err.message}`);
  }

  throw new Error(
    `Plan "${planName}" not found. Use --plan-id <id> to specify directly.`,
  );
}

// ---------------------------------------------------------------------------
// Get or create bucket
// ---------------------------------------------------------------------------

async function getFirstBucket(token, planId) {
  const buckets = await graphGetAll(
    token,
    `/planner/plans/${planId}/buckets?$select=id,name`,
  );
  if (buckets.length > 0) {
    log(`Using bucket "${buckets[0].name}" (${buckets[0].id})`);
    return buckets[0];
  }

  // Create a default bucket
  log('No buckets found, creating "To Do" bucket...');
  const bucket = await graphPost(token, '/planner/buckets', {
    name: 'To Do',
    planId,
  });
  return bucket;
}

// ---------------------------------------------------------------------------
// To Do task filtering
// ---------------------------------------------------------------------------

function isPersonalTask(task) {
  // A task is "personal" if it has NO linked Planner resource
  if (!task.linkedResources || task.linkedResources.length === 0) return true;
  return !task.linkedResources.some(
    (lr) =>
      lr.applicationName &&
      lr.applicationName.toLowerCase().includes('planner'),
  );
}

function mapPriority(todoImportance) {
  switch (todoImportance) {
    case 'high':
      return 1; // Important
    case 'low':
      return 9; // No priority
    default:
      return 5; // Medium
  }
}

function mapPercentComplete(todoStatus) {
  switch (todoStatus) {
    case 'completed':
      return 100;
    case 'inProgress':
      return 50;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrateTask(token, task, planId, bucketId, listName) {
  const plannerTask = {
    planId,
    bucketId,
    title: task.title,
    priority: mapPriority(task.importance),
    percentComplete: mapPercentComplete(task.status),
  };

  // Map due date
  if (task.dueDateTime?.dateTime) {
    plannerTask.dueDateTime = task.dueDateTime.dateTime.replace(/\.0+$/, '') + 'Z';
  }

  if (DRY_RUN) {
    log(
      `  [DRY RUN] Would create: "${task.title}" (from list "${listName}")` +
        (task.dueDateTime ? ` due ${task.dueDateTime.dateTime}` : ''),
    );
    return true;
  }

  // Create Planner task
  const created = await graphPost(token, '/planner/tasks', plannerTask);
  log(`  Created: "${task.title}" → ${created.id}`);

  // Add description and checklist items to Planner task details
  const bodyContent = task.body?.content?.trim();
  const checklistItems = task._checklistItems || [];

  if (bodyContent || checklistItems.length > 0) {
    try {
      const details = await graphGet(
        token,
        `/planner/tasks/${created.id}/details`,
      );
      const patch = {};

      if (bodyContent) {
        // Strip HTML tags for plaintext Planner description
        patch.description = bodyContent.replace(/<[^>]*>/g, '');
        patch.previewType = 'description';
      }

      if (checklistItems.length > 0) {
        patch.checklist = {};
        for (const item of checklistItems) {
          // Planner checklist uses GUIDs as keys
          const id = crypto.randomUUID();
          patch.checklist[id] = {
            '@odata.type': 'microsoft.graph.plannerChecklistItem',
            title: item.displayName,
            isChecked: item.isChecked || false,
          };
        }
      }

      await graphPatch(
        token,
        `/planner/tasks/${created.id}/details`,
        patch,
        details['@odata.etag'],
      );

      if (checklistItems.length > 0) {
        log(`  Added ${checklistItems.length} checklist item(s)`);
      }
    } catch (err) {
      log(`  Warning: failed to set details for "${task.title}": ${err.message}`);
    }
  }

  // Delete original To Do task
  try {
    await graphDelete(
      token,
      `/me/todo/lists/${task._listId}/tasks/${task.id}`,
    );
    log(`  Deleted from To Do: "${task.title}"`);
  } catch (err) {
    log(`  Warning: failed to delete To Do task "${task.title}": ${err.message}`);
  }

  return true;
}

async function main() {
  log('Microsoft To Do → Planner migration');
  if (DRY_RUN) log('*** DRY RUN — no changes will be made ***');

  // 1. Authenticate
  const token = await getAccessToken();

  // 2. Find target plan
  const plan = await findPlan(token, TARGET_PLAN_NAME);
  const bucket = await getFirstBucket(token, plan.id);

  // 3. List all To Do task lists
  const lists = await graphGetAll(token, '/me/todo/lists?$select=id,displayName');
  log(`Found ${lists.length} To Do list(s)`);

  // 4. Collect personal tasks from all lists
  const personalTasks = [];
  for (const list of lists) {
    if (LIST_FILTER && list.displayName !== LIST_FILTER) continue;

    log(`Scanning list "${list.displayName}"...`);
    const tasks = await graphGetAll(
      token,
      `/me/todo/lists/${list.id}/tasks?$select=id,title,body,importance,status,dueDateTime,linkedResources`,
    );

    for (const task of tasks) {
      if (isPersonalTask(task)) {
        task._listId = list.id;
        task._listName = list.displayName;

        // Fetch checklist items (notes/steps) for this task
        try {
          task._checklistItems = await graphGetAll(
            token,
            `/me/todo/lists/${list.id}/tasks/${task.id}/checklistItems`,
          );
        } catch {
          task._checklistItems = [];
        }

        personalTasks.push(task);
      }
    }
  }

  log(`Found ${personalTasks.length} personal task(s) to migrate`);

  if (personalTasks.length === 0) {
    log('Nothing to migrate.');
    console.log(JSON.stringify({ migrated: 0, failed: 0, skipped: 0 }));
    return;
  }

  // 5. Migrate each task
  let migrated = 0;
  let failed = 0;

  for (const task of personalTasks) {
    try {
      await migrateTask(token, task, plan.id, bucket.id, task._listName);
      migrated++;
    } catch (err) {
      log(`  FAILED: "${task.title}": ${err.message}`);
      failed++;
    }

    // Small delay to respect rate limits
    if (!DRY_RUN) await new Promise((r) => setTimeout(r, 200));
  }

  // 6. Verify deletions — re-scan To Do and check migrated tasks are gone
  let verified = 0;
  let stillPresent = 0;
  if (!DRY_RUN && migrated > 0) {
    log('Verifying deletions...');
    const remainingIds = new Set();
    for (const list of lists) {
      if (LIST_FILTER && list.displayName !== LIST_FILTER) continue;
      const remaining = await graphGetAll(
        token,
        `/me/todo/lists/${list.id}/tasks?$select=id,title`,
      );
      for (const t of remaining) remainingIds.add(t.id);
    }

    for (const task of personalTasks) {
      if (remainingIds.has(task.id)) {
        log(`  ⚠ Still in To Do: "${task.title}"`);
        stillPresent++;
      } else {
        verified++;
      }
    }

    log(
      `Verification: ${verified} deleted, ${stillPresent} still present in To Do`,
    );
  }

  const summary = {
    migrated,
    failed,
    total: personalTasks.length,
    verified,
    stillPresent,
  };
  log(`Done. Migrated: ${migrated}, Failed: ${failed}, Total: ${personalTasks.length}`);
  if (!DRY_RUN && migrated > 0) {
    log(`Verification: ${verified}/${migrated} tasks confirmed deleted from To Do`);
  }
  console.log(JSON.stringify(summary));
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
