import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { TaskQueries, initDb } from '@whenlabs/velocity-mcp/lib';
import type { Task } from '@whenlabs/velocity-mcp/lib';

const DASH_DIR = join(homedir(), '.whenlabs');
const DASH_PATH = join(DASH_DIR, 'dashboard.html');

interface CategoryStat {
  category: string;
  count: number;
  avgDuration: number;
  totalDuration: number;
}

interface TagCount {
  tag: string;
  count: number;
}

function parseTags(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  }
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildCategoryStats(tasks: Task[]): CategoryStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const t of tasks) {
    if (!t.duration_seconds) continue;
    const existing = map.get(t.category) ?? { count: 0, total: 0 };
    existing.count++;
    existing.total += t.duration_seconds;
    map.set(t.category, existing);
  }
  return Array.from(map.entries())
    .map(([category, { count, total }]) => ({
      category,
      count,
      avgDuration: total / count,
      totalDuration: total,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildTagCounts(tasks: Task[]): TagCount[] {
  const map = new Map<string, number>();
  for (const t of tasks) {
    for (const tag of parseTags(t.tags as unknown as string)) {
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function svgBarChart(
  data: { label: string; value: number; subtitle?: string }[],
  opts: { width?: number; barHeight?: number; color?: string; valueFormatter?: (v: number) => string },
): string {
  const { width = 520, barHeight = 32, color = '#6366f1', valueFormatter = String } = opts;
  if (data.length === 0) return '<p style="color:#888;font-size:13px">No data yet.</p>';
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const labelWidth = 120;
  const valueWidth = 70;
  const chartWidth = width - labelWidth - valueWidth - 16;
  const height = data.length * (barHeight + 8) + 16;

  const bars = data
    .map((d, i) => {
      const barW = Math.max(2, (d.value / maxVal) * chartWidth);
      const y = i * (barHeight + 8) + 8;
      const sub = d.subtitle ? `<text x="${labelWidth + barW + 6}" y="${y + barHeight / 2 + 4}" font-size="10" fill="#999">${d.subtitle}</text>` : '';
      return `
    <text x="${labelWidth - 6}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="12" fill="#ddd" font-family="system-ui,sans-serif">${d.label}</text>
    <rect x="${labelWidth}" y="${y}" width="${barW}" height="${barHeight}" rx="4" fill="${color}" opacity="0.85"/>
    <text x="${labelWidth + barW + 6}" y="${y + barHeight / 2 + 4}" font-size="12" fill="#e2e8f0" font-family="system-ui,sans-serif">${valueFormatter(d.value)}${sub ? '' : ''}</text>
    ${sub}`;
    })
    .join('');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function generateHtml(tasks: Task[]): string {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentTasks = tasks
    .filter((t) => t.ended_at && new Date(t.ended_at) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.ended_at!).getTime() - new Date(a.ended_at!).getTime())
    .slice(0, 20);

  const catStats = buildCategoryStats(tasks);
  const tagCounts = buildTagCounts(tasks);

  const totalTasks = tasks.length;
  const totalSeconds = tasks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
  const avgSeconds = totalTasks > 0 ? totalSeconds / totalTasks : 0;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const catChartData = catStats.map((c) => ({
    label: c.category,
    value: c.count,
    subtitle: fmtDuration(c.avgDuration) + ' avg',
  }));

  const durationChartData = catStats
    .filter((c) => c.avgDuration > 0)
    .map((c) => ({
      label: c.category,
      value: Math.round(c.avgDuration),
      subtitle: '',
    }));

  const tagChartData = tagCounts.map((t) => ({
    label: t.tag,
    value: t.count,
  }));

  const catChart = svgBarChart(catChartData, {
    color: '#6366f1',
    valueFormatter: (v) => `${v} tasks`,
  });

  const durationChart = svgBarChart(durationChartData, {
    color: '#10b981',
    valueFormatter: fmtDuration,
  });

  const tagChart = svgBarChart(tagChartData, {
    color: '#f59e0b',
    valueFormatter: (v) => `${v}`,
  });

  const recentRows = recentTasks
    .map((t) => {
      const tags = parseTags(t.tags as unknown as string);
      const dur = t.duration_seconds ? fmtDuration(t.duration_seconds) : '—';
      const statusColor =
        t.status === 'completed' ? '#10b981' : t.status === 'failed' ? '#ef4444' : '#94a3b8';
      const tagBadges = tags
        .slice(0, 4)
        .map((tag) => `<span class="tag">${tag}</span>`)
        .join('');
      return `
      <tr>
        <td><span class="cat-badge cat-${t.category}">${t.category}</span></td>
        <td class="desc">${t.description}</td>
        <td>${tagBadges}</td>
        <td style="color:${statusColor};text-align:center">${t.status ?? '—'}</td>
        <td style="text-align:right;color:#94a3b8">${dur}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Velocity Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 24px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28px;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 16px;
  }
  .header h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; }
  .header .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
  .badge-when {
    background: #6366f1;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 28px;
  }
  @media (max-width: 700px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  .stat-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 16px 20px;
  }
  .stat-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .stat-card .value { font-size: 28px; font-weight: 700; color: #f1f5f9; margin: 4px 0 2px; }
  .stat-card .sub { font-size: 11px; color: #64748b; }
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-bottom: 28px;
  }
  @media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
  .chart-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 18px 20px;
  }
  .chart-card.full { grid-column: 1 / -1; }
  .chart-card h2 { font-size: 13px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 14px; }
  .table-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 18px 20px;
    overflow-x: auto;
  }
  .table-card h2 { font-size: 13px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #64748b; font-weight: 500; font-size: 11px; text-transform: uppercase; padding: 6px 10px; border-bottom: 1px solid #334155; }
  td { padding: 8px 10px; border-bottom: 1px solid #1e293b; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .desc { max-width: 340px; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag {
    display: inline-block;
    background: #334155;
    color: #94a3b8;
    font-size: 10px;
    padding: 1px 7px;
    border-radius: 999px;
    margin-right: 3px;
  }
  .cat-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: .03em;
  }
  .cat-scaffold { background:#1e3a5f; color:#60a5fa; }
  .cat-implement { background:#1a2e3b; color:#38bdf8; }
  .cat-refactor  { background:#1e3b2e; color:#4ade80; }
  .cat-debug     { background:#3b2020; color:#f87171; }
  .cat-test      { background:#2d2b3b; color:#a78bfa; }
  .cat-config    { background:#2d2a1a; color:#fbbf24; }
  .cat-docs      { background:#1e2e3b; color:#7dd3fc; }
  .cat-deploy    { background:#1e2e1e; color:#86efac; }
  .generated-at { font-size: 11px; color: #475569; margin-top: 20px; text-align: right; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Velocity Dashboard</h1>
    <div class="subtitle">Generated ${now.toLocaleString()}</div>
  </div>
  <span class="badge-when">@whenlabs/when</span>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="label">Total Tasks</div>
    <div class="value">${totalTasks}</div>
    <div class="sub">${completedCount} completed</div>
  </div>
  <div class="stat-card">
    <div class="label">Total Time</div>
    <div class="value">${fmtDuration(totalSeconds)}</div>
    <div class="sub">across all tasks</div>
  </div>
  <div class="stat-card">
    <div class="label">Avg Duration</div>
    <div class="value">${fmtDuration(avgSeconds)}</div>
    <div class="sub">per task</div>
  </div>
  <div class="stat-card">
    <div class="label">Categories</div>
    <div class="value">${catStats.length}</div>
    <div class="sub">active categories</div>
  </div>
</div>

<div class="charts-grid">
  <div class="chart-card">
    <h2>Tasks by Category</h2>
    ${catChart}
  </div>
  <div class="chart-card">
    <h2>Avg Duration by Category</h2>
    ${durationChart}
  </div>
  <div class="chart-card full">
    <h2>Top Tags</h2>
    ${tagChart}
  </div>
</div>

<div class="table-card">
  <h2>Recent Tasks (last 7 days)</h2>
  ${
    recentRows
      ? `<table>
    <thead><tr>
      <th>Category</th><th>Description</th><th>Tags</th><th style="text-align:center">Status</th><th style="text-align:right">Duration</th>
    </tr></thead>
    <tbody>${recentRows}</tbody>
  </table>`
      : '<p style="color:#888;font-size:13px">No tasks in the last 7 days.</p>'
  }
</div>

<div class="generated-at">Generated by <code>when velocity dashboard</code></div>
</body>
</html>`;
}

export async function generateDashboard(): Promise<{ path: string; summary: string }> {
  const db = initDb();
  const queries = new TaskQueries(db);

  const now = new Date().toISOString();
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const tasks = queries.getCompletedInRange(yearAgo, now) as Task[];
  db.close();

  const html = generateHtml(tasks);
  mkdirSync(DASH_DIR, { recursive: true });
  writeFileSync(DASH_PATH, html, 'utf8');

  const catStats = buildCategoryStats(tasks);
  const totalSeconds = tasks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
  const topCats = catStats
    .slice(0, 3)
    .map((c) => `${c.category}(${c.count})`)
    .join(', ');

  const summary = [
    `Total tasks: ${tasks.length}`,
    `Total time: ${fmtDuration(totalSeconds)}`,
    `Top categories: ${topCats || 'none yet'}`,
    `Dashboard written to: ${DASH_PATH}`,
  ].join('\n');

  return { path: DASH_PATH, summary };
}

function openFile(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${filePath}"`, { stdio: 'ignore' });
    } else if (platform === 'linux') {
      execSync(`xdg-open "${filePath}"`, { stdio: 'ignore' });
    }
  } catch {
    // best-effort — file is still written
  }
}

export function registerVelocityDashboard(server: McpServer): void {
  server.tool(
    'velocity_dashboard',
    'Generate an HTML dashboard with charts showing task timing stats — opens in browser',
    {},
    async () => {
      const { path, summary } = await generateDashboard();
      openFile(path);
      const text = `Dashboard generated and opened in browser.\n\n${summary}`;
      return { content: [{ type: 'text' as const, text }] };
    },
  );
}
