import { api } from '../api';
import { ClientSyncMeta, FullBackupPayload } from '../types';

export const GIST_FILENAME = 'mgp_sync_state.json';

/**
 * Collects active client metadata from localStorage and sessionStorage
 */
export function collectClientMeta(): ClientSyncMeta {
  const drafts: Record<string, string> = {};
  if (typeof sessionStorage !== 'undefined') {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('mgp_active_session_')) {
          const val = sessionStorage.getItem(key);
          if (val) drafts[key] = val;
        }
      }
    } catch (e) {
      console.warn('Failed to read sessionStorage drafts', e);
    }
  }

  return {
    cycleAnchorDate:
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('mgp_cycle_anchor_date')
        : null,
    cycleAnchorManual:
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('mgp_cycle_anchor_manual')
        : null,
    activeSessionDrafts: drafts,
  };
}

/**
 * Restores client metadata into localStorage and sessionStorage
 */
export function applyClientMeta(meta?: ClientSyncMeta | null) {
  if (!meta) return;

  if (typeof localStorage !== 'undefined') {
    try {
      if (meta.cycleAnchorDate !== undefined) {
        if (meta.cycleAnchorDate === null) {
          localStorage.removeItem('mgp_cycle_anchor_date');
        } else {
          localStorage.setItem('mgp_cycle_anchor_date', meta.cycleAnchorDate);
        }
      }
      if (meta.cycleAnchorManual !== undefined) {
        if (meta.cycleAnchorManual === null) {
          localStorage.removeItem('mgp_cycle_anchor_manual');
        } else {
          localStorage.setItem('mgp_cycle_anchor_manual', meta.cycleAnchorManual);
        }
      }
    } catch (e) {
      console.warn('Failed to update localStorage', e);
    }
  }

  if (typeof sessionStorage !== 'undefined' && meta.activeSessionDrafts) {
    try {
      for (const [key, val] of Object.entries(meta.activeSessionDrafts)) {
        if (key.startsWith('mgp_active_session_') && val) {
          sessionStorage.setItem(key, val);
        }
      }
    } catch (e) {
      console.warn('Failed to restore active session drafts', e);
    }
  }
}

/**
 * Exports complete backup with current client metadata
 */
export async function exportBackupWithMeta(): Promise<FullBackupPayload> {
  const meta = collectClientMeta();
  return await api.exportFullBackup(meta);
}

/**
 * Triggers a browser .json file download
 */
export function downloadBackupJsonFile(payload: FullBackupPayload) {
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mgp-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Encodes backup payload into a clean MGP1: Base64 string for clipboard copy
 */
export function encodeSyncString(payload: FullBackupPayload): string {
  const json = JSON.stringify(payload);
  const utf8Bytes = new TextEncoder().encode(json);
  let binary = '';
  const len = utf8Bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return 'MGP1:' + btoa(binary);
}

/**
 * Decodes MGP1: Base64 string into FullBackupPayload
 */
export function decodeSyncString(code: string): FullBackupPayload {
  const trimmed = code.trim();
  const raw = trimmed.startsWith('MGP1:') ? trimmed.slice(5) : trimmed;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json);
  if (!payload || typeof payload !== 'object' || !payload.settings || !payload.profile) {
    throw new Error('Invalid sync code format: missing settings or profile');
  }
  return payload as FullBackupPayload;
}

/**
 * Validates, imports to Rust storage, and applies client metadata
 */
export async function importBackupAndApply(
  payload: FullBackupPayload
): Promise<FullBackupPayload> {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !payload.settings ||
    !payload.profile
  ) {
    throw new Error('Invalid backup payload: missing settings or profile');
  }
  const result = await api.importFullBackup(payload);
  applyClientMeta(payload.client_meta);
  return result;
}

/**
 * Option 2: Pull all data from LAN Wi-Fi Server
 */
export async function pullFromLanServer(
  ip: string,
  port: number,
  pin: string
): Promise<FullBackupPayload> {
  const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `http://${cleanIp}:${port}/sync?pin=${encodeURIComponent(pin.trim())}`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wi-Fi sync error (${response.status}): ${text || response.statusText}`);
  }
  const payload = (await response.json()) as FullBackupPayload;
  return await importBackupAndApply(payload);
}

/**
 * Option 2: Push all data to LAN Wi-Fi Server
 */
export async function pushToLanServer(
  ip: string,
  port: number,
  pin: string
): Promise<boolean> {
  const payload = await exportBackupWithMeta();
  const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `http://${cleanIp}:${port}/sync?pin=${encodeURIComponent(pin.trim())}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wi-Fi push error (${response.status}): ${text || response.statusText}`);
  }
  return true;
}

/**
 * Option 3: Push to GitHub Secret Gist
 */
export async function pushToGitHubGist(
  token: string,
  existingGistId?: string
): Promise<{ gistId: string; payload: FullBackupPayload }> {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error('GitHub token is required');

  const payload = await exportBackupWithMeta();
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  let gistId = existingGistId?.trim() || (typeof localStorage !== 'undefined' ? localStorage.getItem('mgp_gist_id') || undefined : undefined);

  if (gistId) {
    const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: 'MGP Cross-Device Sync State',
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(payload, null, 2),
          },
        },
      }),
    });
    if (patchRes.ok) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mgp_gist_id', gistId);
        localStorage.setItem('mgp_gist_token', cleanToken);
        localStorage.setItem('mgp_last_synced', Date.now().toString());
      }
      return { gistId, payload };
    }
  }

  // Look for existing gist in user account
  const listRes = await fetch('https://api.github.com/gists?per_page=100', {
    method: 'GET',
    headers,
  });

  if (listRes.ok) {
    const gists = (await listRes.json()) as Array<{ id: string; files: Record<string, any> }>;
    const match = gists.find((g) => g.files && g.files[GIST_FILENAME]);
    if (match) {
      gistId = match.id;
      const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          description: 'MGP Cross-Device Sync State',
          files: {
            [GIST_FILENAME]: {
              content: JSON.stringify(payload, null, 2),
            },
          },
        }),
      });
      if (patchRes.ok) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('mgp_gist_id', gistId);
          localStorage.setItem('mgp_gist_token', cleanToken);
          localStorage.setItem('mgp_last_synced', Date.now().toString());
        }
        return { gistId, payload };
      }
    }
  }

  // Create new secret gist
  const createRes = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: 'MGP Cross-Device Sync State',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create secret Gist (${createRes.status}): ${errText}`);
  }

  const created = (await createRes.json()) as { id: string };
  gistId = created.id;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mgp_gist_id', gistId);
    localStorage.setItem('mgp_gist_token', cleanToken);
    localStorage.setItem('mgp_last_synced', Date.now().toString());
  }
  return { gistId, payload };
}

/**
 * Option 3: Pull from GitHub Secret Gist
 */
export async function pullFromGitHubGist(
  token: string,
  gistId?: string
): Promise<FullBackupPayload> {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error('GitHub token is required');

  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let targetId = gistId?.trim() || (typeof localStorage !== 'undefined' ? localStorage.getItem('mgp_gist_id') || undefined : undefined);

  if (!targetId) {
    const listRes = await fetch('https://api.github.com/gists?per_page=100', {
      method: 'GET',
      headers,
    });
    if (!listRes.ok) {
      throw new Error(`Failed to query user Gists (${listRes.status})`);
    }
    const gists = (await listRes.json()) as Array<{ id: string; files: Record<string, any> }>;
    const match = gists.find((g) => g.files && g.files[GIST_FILENAME]);
    if (!match) {
      throw new Error(`No Gist containing '${GIST_FILENAME}' found on your account.`);
    }
    targetId = match.id;
  }

  const getRes = await fetch(`https://api.github.com/gists/${targetId}`, {
    method: 'GET',
    headers,
  });

  if (!getRes.ok) {
    throw new Error(`Failed to fetch Gist ${targetId} (${getRes.status})`);
  }

  const data = (await getRes.json()) as { files: Record<string, { content?: string }> };
  const fileObj = data.files?.[GIST_FILENAME];
  if (!fileObj || !fileObj.content) {
    throw new Error(`Gist ${targetId} is missing '${GIST_FILENAME}' file.`);
  }

  const payload = JSON.parse(fileObj.content) as FullBackupPayload;
  const applied = await importBackupAndApply(payload);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mgp_gist_id', targetId);
    localStorage.setItem('mgp_gist_token', cleanToken);
    localStorage.setItem('mgp_last_synced', Date.now().toString());
  }
  return applied;
}
