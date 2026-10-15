// Automatic local backups on the schedule chosen in Settings.
import { getData, useData } from '../../data/store';
import { backupNow, listBackups } from '../../data/platform';

export const SCHEDULES: [string, string][] = [
  ['hourly', 'Every hour'],
  ['daily', 'Every day'],
  ['weekly', 'Every week'],
  ['close', 'Only when I close the app'],
  ['off', 'Off (manual only)'],
];

const GAP: Record<string, number> = { hourly: 3600e3, daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3 };

let running = false;

export async function runScheduledBackup(trigger: 'timer' | 'close') {
  const { treeId } = useData.getState();
  if (!treeId || running) return;
  const schedule = getData().settings.backup_schedule || 'daily';
  if (schedule === 'off') return;
  if (trigger === 'close' && schedule !== 'close' && schedule !== 'daily' && schedule !== 'hourly' && schedule !== 'weekly') return;
  running = true;
  try {
    const list = await listBackups(treeId);
    const last = list.find((b) => b.reason === 'auto' || b.reason === 'close');
    const lastTime = last ? new Date(last.created).getTime() : 0;
    if (trigger === 'close') {
      // On close: always for "when I close"; for timed schedules only if one is due.
      if (schedule === 'close' || Date.now() - lastTime >= (GAP[schedule] || 0)) await backupNow(treeId, 'close');
      return;
    }
    if (schedule === 'close') return;
    if (Date.now() - lastTime >= GAP[schedule]) await backupNow(treeId, 'auto');
  } catch (e) {
    console.warn('Scheduled backup failed', e);
  } finally {
    running = false;
  }
}
