import { Controller, Get, Header, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalysisResult } from '../../../modules/scoring/types/result.types';
import { SCORING_SCHEMA_VERSION } from 'src/modules/scoring/constants';

/** ─────────────────────────────────────────────────────────────
 *  Static fixture: GitHub-only developer (no wallet)
 * ───────────────────────────────────────────────────────────── */
const MOCK_GITHUB_ONLY: AnalysisResult = {
  summary:
    'Backend-focused developer who actively maintains a solid portfolio of 4 projects. Active in the Solana ecosystem.',
  capabilities: {
    backend: { score: 0.82, confidence: 'high' },
    frontend: { score: 0.31, confidence: 'low' },
    devops: { score: 0.54, confidence: 'medium' },
  },
  ownership: {
    ownedProjects: 12,
    activelyMaintained: 4,
    confidence: 'high',
  },
  impact: {
    activityLevel: 'high',
    consistency: 'strong',
    externalContributions: 7,
    confidence: 'high',
  },
  reputation: null,
  organizations: [],
  interactionProfile: null,
  stack: {
    languages: ['TypeScript', 'Rust', 'Go'],
    tools: ['Docker', 'Anchor', 'Prisma', 'Redis'],
  },
  web3: null,
  schemaVersion: SCORING_SCHEMA_VERSION
};

/** ─────────────────────────────────────────────────────────────
 *  Static fixture: Solana wallet developer (GitHub + wallet)
 * ───────────────────────────────────────────────────────────── */
const MOCK_WALLET: AnalysisResult = {
  summary:
    'Backend-focused developer who actively maintains a solid portfolio of 4 projects. Active in the Solana ecosystem. Superteam bounty contributor (3 completions).',
  capabilities: {
    backend: { score: 0.87, confidence: 'high' },
    frontend: { score: 0.22, confidence: 'low' },
    devops: { score: 0.51, confidence: 'medium' },
  },
  ownership: {
    ownedProjects: 12,
    activelyMaintained: 4,
    confidence: 'high',
  },
  impact: {
    activityLevel: 'high',
    consistency: 'strong',
    externalContributions: 7,
    confidence: 'high',
  },
  reputation: null,
  organizations: [],
  interactionProfile: null,
  stack: {
    languages: ['Rust', 'TypeScript', 'Go'],
    tools: ['Anchor', 'Docker', 'Prisma', 'Redis'],
  },
  web3: {
    ecosystem: 'solana',
    ecosystemPRs: 3,
    deployedPrograms: [
      {
        programId: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
        deployedAt: '2023-06-15T10:00:00.000Z',
        isActive: true,
        uniqueCallers: 142,
        upgradeCount: 11,
      },
      {
        programId: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        deployedAt: '2024-01-22T08:30:00.000Z',
        isActive: true,
        uniqueCallers: 58,
        upgradeCount: 4,
      },
      {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        deployedAt: '2022-09-10T14:00:00.000Z',
        isActive: false,
        uniqueCallers: 12,
        upgradeCount: 2,
      },
    ],
  },
  schemaVersion: SCORING_SCHEMA_VERSION
};

/** ─────────────────────────────────────────────────────────────
 *  Static fixture: Wallet-only (no GitHub username provided)
 * ───────────────────────────────────────────────────────────── */
const MOCK_WALLET_ONLY: AnalysisResult = {
  summary:
    'Developer with a focus on backend with a consistent open-source presence. Active in the Solana ecosystem. Superteam bounty contributor (1 completions).',
  capabilities: {
    backend: { score: 0.5, confidence: 'medium' },
    frontend: { score: 0.1, confidence: 'low' },
    devops: { score: 0.3, confidence: 'low' },
  },
  ownership: {
    ownedProjects: 0,
    activelyMaintained: 0,
    confidence: 'low',
  },
  impact: {
    activityLevel: 'medium',
    consistency: 'moderate',
    externalContributions: 0,
    confidence: 'low',
  },
  stack: {
    languages: ['Rust'],
    tools: ['Anchor'],
  },
  reputation: null,
  organizations: [],
  interactionProfile: null,
  web3: {
    ecosystem: 'solana',
    ecosystemPRs: 0,
    deployedPrograms: [
      {
        programId: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
        deployedAt: '2024-03-01T00:00:00.000Z',
        isActive: true,
        uniqueCallers: 19,
        upgradeCount: 7,
      },
    ],
  },
  schemaVersion: SCORING_SCHEMA_VERSION,
};

@ApiTags('Mock / Dev Reference')
@Controller('api/mock')
export class MockController {
  /** Full fixture: GitHub + Solana wallet */
  @Get('analysis/wallet')
  @ApiOperation({
    summary: '[MOCK] GitHub + Solana wallet result',
    description:
      'Returns a fully populated AnalysisResult including deployedPrograms with upgradeCount and Superteam achievements. Use this to develop wallet-related UI.',
  })
  getWallet(): AnalysisResult {
    return MOCK_WALLET;
  }

  /** Fixture: GitHub-only (web3 null) */
  @Get('analysis/github-only')
  @ApiOperation({
    summary: '[MOCK] GitHub-only result (web3: null)',
    description:
      'Returns an AnalysisResult where web3 is null. Use to verify UI renders correctly without wallet data.',
  })
  getGithubOnly(): AnalysisResult {
    return MOCK_GITHUB_ONLY;
  }

  /** Fixture: Wallet-only (no GitHub) */
  @Get('analysis/wallet-only')
  @ApiOperation({
    summary: '[MOCK] Wallet-only result (no GitHub)',
    description:
      'Returns an AnalysisResult with low-confidence GitHub signals and on-chain wallet data only.',
  })
  getWalletOnly(): AnalysisResult {
    return MOCK_WALLET_ONLY;
  }

  /** Default: returns all three fixtures keyed by mode */
  @Get('analysis')
  @ApiOperation({
    summary: '[MOCK] All AnalysisResult fixtures',
    description:
      'Returns all three mock AnalysisResult variants in one response. Useful for component story setup.',
  })
  getAll(): Record<string, AnalysisResult> {
    return {
      'github-only': MOCK_GITHUB_ONLY,
      wallet: MOCK_WALLET,
      'wallet-only': MOCK_WALLET_ONLY,
    };
  }

  /** HTML viewer page for frontend reference */
  @Get('viewer')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: '[MOCK] API Viewer, interactive reference page',
    description:
      'Serves a standalone HTML page that renders all mock API responses for frontend developers.',
  })
  getViewer(@Res() res: Response): void {
    res.status(HttpStatus.OK).send(VIEWER_HTML);
  }
}

// ─────────────────────────────────────────────────────────────
// Standalone HTML viewer page
// ─────────────────────────────────────────────────────────────
const VIEWER_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Mock Viewer · Colosseum Stage 3</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --surface2: #1a1a26;
      --border: #252535;
      --accent: #7c3aed;
      --accent2: #06b6d4;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --text: #e2e8f0;
      --muted: #64748b;
      --tag-bg: #1e1e30;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      line-height: 1.6;
    }

    /* NAV */
    nav {
      position: sticky; top: 0; z-index: 50;
      background: rgba(10,10,15,0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 2rem;
      display: flex; align-items: center; gap: 2rem;
      height: 56px;
    }
    .nav-logo { font-size: 0.9rem; font-weight: 700; color: var(--accent); letter-spacing: 0.05em; text-transform: uppercase; }
    .nav-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 99px; background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
    .nav-tabs { display: flex; gap: 4px; margin-left: auto; }
    .tab-btn {
      padding: 6px 16px; border-radius: 8px; font-size: 0.82rem; font-weight: 500;
      background: transparent; border: 1px solid transparent; color: var(--muted);
      cursor: pointer; transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text); background: var(--surface2); }
    .tab-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

    /* LAYOUT */
    main { max-width: 1400px; margin: 0 auto; padding: 2.5rem 2rem; }
    .page-header { margin-bottom: 2rem; }
    .page-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.35rem; }
    .page-desc { color: var(--muted); font-size: 0.9rem; }

    /* ENDPOINT PILL */
    .endpoint-pill {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: 8px; padding: 6px 14px; font-size: 0.8rem; margin-bottom: 1.5rem;
    }
    .method { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent2); font-size: 0.75rem; }
    .path { font-family: 'JetBrains Mono', monospace; color: var(--text); }

    /* PANELS */
    .panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 900px) { .panel-grid { grid-template-columns: 1fr; } }

    .panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .panel-header {
      padding: 14px 18px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .panel-title { font-size: 0.85rem; font-weight: 600; }
    .panel-subtitle { font-size: 0.75rem; color: var(--muted); margin-left: auto; }

    /* SCORE CARDS */
    .score-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; }
    .score-card { background: var(--surface2); padding: 16px; }
    .score-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 8px; }
    .score-value { font-size: 1.6rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .score-confidence { font-size: 0.72rem; margin-top: 4px; }
    .conf-high { color: var(--green); }
    .conf-medium { color: var(--amber); }
    .conf-low { color: var(--red); }

    /* STAT ROW */
    .stat-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border); }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { font-size: 0.82rem; color: var(--muted); }
    .stat-value { font-size: 0.82rem; font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    /* TAGS */
    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; padding: 14px 18px; }
    .tag {
      font-size: 0.72rem; font-weight: 500; padding: 3px 10px; border-radius: 6px;
      background: var(--tag-bg); border: 1px solid var(--border); color: var(--text);
    }
    .tag-tool { border-color: var(--accent); color: var(--accent); }

    /* WEB3 */
    .web3-null { padding: 24px 18px; text-align: center; color: var(--muted); font-size: 0.85rem; }
    .program-card {
      margin: 0 18px 12px; padding: 14px; border-radius: 8px;
      background: var(--surface2); border: 1px solid var(--border);
    }
    .program-id { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--muted); word-break: break-all; margin-bottom: 10px; }
    .program-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .program-stat { background: var(--surface); border-radius: 6px; padding: 8px 10px; }
    .pill {
      display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 600;
      padding: 2px 8px; border-radius: 99px;
    }
    .pill-active { background: rgba(16,185,129,0.12); color: var(--green); border: 1px solid rgba(16,185,129,0.3); }
    .pill-inactive { background: rgba(239,68,68,0.1); color: var(--red); border: 1px solid rgba(239,68,68,0.25); }

    /* ACHIEVEMENT */
    .achievement {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 18px; border-bottom: 1px solid var(--border);
    }
    .achievement:last-child { border-bottom: none; }
    .ach-icon { font-size: 1.1rem; margin-top: 1px; }
    .ach-label { font-size: 0.82rem; font-weight: 500; }
    .ach-meta { font-size: 0.72rem; color: var(--muted); }

    /* SUMMARY */
    .summary-box { margin: 18px; padding: 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; line-height: 1.7; }

    /* JSON PANEL */
    .json-panel { flex: 1; overflow: auto; }
    pre {
      padding: 18px; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
      line-height: 1.65; white-space: pre-wrap; word-break: break-word;
      color: #a5b4fc; background: #0d0d18; margin: 0; height: 100%;
    }
    .json-key { color: #93c5fd; }
    .json-string { color: #86efac; }
    .json-number { color: #fca5a5; }
    .json-bool { color: #f9a8d4; }
    .json-null { color: var(--muted); }

    /* TAB CONTENT */
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* PROGRESS BAR */
    .bar-wrap { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--border); }
    .bar-wrap:last-child { border-bottom: none; }
    .bar-name { font-size: 0.78rem; width: 70px; color: var(--muted); }
    .bar-track { flex: 1; height: 6px; background: var(--surface2); border-radius: 99px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
    .bar-pct { font-size: 0.72rem; font-family: 'JetBrains Mono', monospace; width: 36px; text-align: right; }

    .upgrade-badge {
      display: inline-flex; align-items: center; gap: 4px; font-size: 0.68rem;
      padding: 2px 7px; border-radius: 5px;
      background: rgba(124,58,237,0.15); color: var(--accent);
      border: 1px solid rgba(124,58,237,0.3); font-weight: 600;
    }
  </style>
</head>
<body>

<nav>
  <span class="nav-logo">Colosseum</span>
  <span class="nav-badge">Stage 3 · API Mock Viewer</span>
  <div class="nav-tabs">
    <button class="tab-btn active" onclick="switchTab('wallet')">GitHub + Wallet</button>
    <button class="tab-btn" onclick="switchTab('github-only')">GitHub Only</button>
    <button class="tab-btn" onclick="switchTab('wallet-only')">Wallet Only</button>
    <button class="tab-btn" onclick="switchTab('json')">Raw JSON</button>
  </div>
</nav>

<main>
  <div class="page-header">
    <h1 class="page-title">Mock API Viewer</h1>
    <p class="page-desc">Static AnalysisResult fixtures for frontend development · No authentication required</p>
  </div>

  <!-- ───── WALLET TAB ───── -->
  <div id="tab-wallet" class="tab-content active">
    <div class="endpoint-pill">
      <span class="method">GET</span>
      <span class="path">/api/mock/analysis/wallet</span>
    </div>
    <div class="panel-grid" id="wallet-grid"></div>
  </div>

  <!-- ───── GITHUB-ONLY TAB ───── -->
  <div id="tab-github-only" class="tab-content">
    <div class="endpoint-pill">
      <span class="method">GET</span>
      <span class="path">/api/mock/analysis/github-only</span>
    </div>
    <div class="panel-grid" id="github-grid"></div>
  </div>

  <!-- ───── WALLET-ONLY TAB ───── -->
  <div id="tab-wallet-only" class="tab-content">
    <div class="endpoint-pill">
      <span class="method">GET</span>
      <span class="path">/api/mock/analysis/wallet-only</span>
    </div>
    <div class="panel-grid" id="walletonly-grid"></div>
  </div>

  <!-- ───── RAW JSON TAB ───── -->
  <div id="tab-json" class="tab-content">
    <div class="endpoint-pill">
      <span class="method">GET</span>
      <span class="path">/api/mock/analysis</span>
    </div>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">All Fixtures</span>
        <span class="panel-subtitle">application/json</span>
      </div>
      <div class="json-panel">
        <pre id="json-display">Loading…</pre>
      </div>
    </div>
  </div>
</main>

<script>
  const FIXTURES = {
    wallet: null,
    'github-only': null,
    'wallet-only': null,
  };

  async function loadAll() {
    const res = await fetch('/api/mock/analysis');
    const data = await res.json();
    FIXTURES['wallet'] = data['wallet'];
    FIXTURES['github-only'] = data['github-only'];
    FIXTURES['wallet-only'] = data['wallet-only'];
    renderTab('wallet');
    document.getElementById('json-display').textContent = syntaxHighlight(JSON.stringify(data, null, 2));
  }

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
      const names = ['wallet', 'github-only', 'wallet-only', 'json'];
      b.classList.toggle('active', names[i] === name);
    });
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    renderTab(name);
  }

  function renderTab(name) {
    const gridMap = { wallet: 'wallet-grid', 'github-only': 'github-grid', 'wallet-only': 'walletonly-grid' };
    const gridId = gridMap[name];
    if (!gridId || !FIXTURES[name]) return;
    const grid = document.getElementById(gridId);
    if (grid.innerHTML) return; // already rendered
    grid.innerHTML = buildDashboard(FIXTURES[name]);
  }

  function buildDashboard(d) {
    return capabilitiesPanel(d) + impactPanel(d) + stackPanel(d) + web3Panel(d) + summaryPanel(d);
  }

  function capabilitiesPanel(d) {
    const caps = d.capabilities;
    const bars = ['backend', 'frontend', 'devops'].map(k => {
      const s = caps[k];
      const pct = Math.round(s.score * 100);
      const color = pct > 65 ? '#7c3aed' : pct > 35 ? '#06b6d4' : '#64748b';
      return \`<div class="bar-wrap">
        <span class="bar-name">\${k}</span>
        <div class="bar-track"><div class="bar-fill" style="width:\${pct}%;background:\${color}"></div></div>
        <span class="bar-pct">\${pct}%</span>
        <span class="score-confidence conf-\${s.confidence}">\${s.confidence}</span>
      </div>\`;
    }).join('');
    return \`<div class="panel">
      <div class="panel-header"><span class="panel-title">🎯 Capabilities</span></div>
      \${bars}
    </div>\`;
  }

  function impactPanel(d) {
    const imp = d.impact;
    const own = d.ownership;
    const levelColor = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--red)' };
    const consColor = { strong: 'var(--green)', moderate: 'var(--amber)', sparse: 'var(--red)' };
    return \`<div class="panel">
      <div class="panel-header"><span class="panel-title">📈 Impact & Ownership</span></div>
      <div class="stat-row"><span class="stat-label">Activity Level</span><span class="stat-value" style="color:\${levelColor[imp.activityLevel]}">\${imp.activityLevel.toUpperCase()}</span></div>
      <div class="stat-row"><span class="stat-label">Consistency</span><span class="stat-value" style="color:\${consColor[imp.consistency]}">\${imp.consistency}</span></div>
      <div class="stat-row"><span class="stat-label">External Contributions</span><span class="stat-value">\${imp.externalContributions}</span></div>
      <div class="stat-row"><span class="stat-label">Confidence</span><span class="stat-value">\${imp.confidence}</span></div>
      <div class="stat-row"><span class="stat-label">Owned Projects</span><span class="stat-value">\${own.ownedProjects}</span></div>
      <div class="stat-row"><span class="stat-label">Actively Maintained</span><span class="stat-value">\${own.activelyMaintained}</span></div>
    </div>\`;
  }

  function stackPanel(d) {
    const langs = d.stack.languages.map(l => \`<span class="tag">\${l}</span>\`).join('');
    const tools = d.stack.tools.map(t => \`<span class="tag tag-tool">\${t}</span>\`).join('');
    return \`<div class="panel">
      <div class="panel-header"><span class="panel-title">🔧 Tech Stack</span></div>
      <div class="panel-header" style="border-top:none;border-bottom:1px solid var(--border);padding-top:8px">
        <span class="stat-label" style="font-size:0.72rem">Languages</span>
      </div>
      <div class="tag-list">\${langs || '<span class="stat-label">None detected</span>'}</div>
      <div class="panel-header" style="border:none;border-top:1px solid var(--border);padding-top:8px">
        <span class="stat-label" style="font-size:0.72rem">Tools</span>
      </div>
      <div class="tag-list">\${tools || '<span class="stat-label">None detected</span>'}</div>
    </div>\`;
  }

  function web3Panel(d) {
    if (!d.web3) {
      return \`<div class="panel">
        <div class="panel-header"><span class="panel-title">⛓ Web3 / Solana</span></div>
        <div class="web3-null">web3: null, GitHub-only mode</div>
      </div>\`;
    }
    const w = d.web3;
    const programs = (w.deployedPrograms || []).map(p => {
      const activePill = p.isActive
        ? \`<span class="pill pill-active">● Active</span>\`
        : \`<span class="pill pill-inactive">● Inactive</span>\`;
      return \`<div class="program-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          \${activePill}
          <span class="upgrade-badge">↑ \${p.upgradeCount} upgrades</span>
        </div>
        <div class="program-id">\${p.programId}</div>
        <div class="program-stats">
          <div class="program-stat">
            <div class="score-label">Unique Callers</div>
            <div class="stat-value">\${p.uniqueCallers}</div>
          </div>
          <div class="program-stat">
            <div class="score-label">Deployed At</div>
            <div class="stat-value" style="font-size:0.7rem">\${p.deployedAt ? p.deployedAt.split('T')[0] : '—'}</div>
          </div>
        </div>
      </div>\`;
    }).join('');

    const header = \`<div class="stat-row">
      <span class="stat-label">Ecosystem</span>
      <span class="stat-value" style="color:var(--accent2)">\${w.ecosystem}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Ecosystem PRs</span><span class="stat-value">\${w.ecosystemPRs}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Deployed Programs</span><span class="stat-value">\${w.deployedPrograms.length}</span>
    </div>\`;

    return \`<div class="panel" style="grid-column:span 2">
      <div class="panel-header"><span class="panel-title">⛓ Web3 / Solana</span></div>
      \${header}
      <div class="panel-header" style="border-top:1px solid var(--border);padding-top:8px">
        <span class="stat-label" style="font-size:0.72rem">Deployed Programs</span>
      </div>
      <div style="padding:12px 0">\${programs}</div>
    </div>\`;
  }

  function summaryPanel(d) {
    return \`<div class="panel" style="grid-column:span 2">
      <div class="panel-header"><span class="panel-title">📝 Generated Summary</span></div>
      <div class="summary-box">\${d.summary}</div>
    </div>\`;
  }

  function syntaxHighlight(json) {
    return json
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function(m) {
        if (/^"/.test(m)) return /:$/.test(m) ? '<span class="json-key">' + m + '</span>' : '<span class="json-string">' + m + '</span>';
        if (/true|false/.test(m)) return '<span class="json-bool">' + m + '</span>';
        if (/null/.test(m)) return '<span class="json-null">' + m + '</span>';
        return '<span class="json-number">' + m + '</span>';
      });
  }

  loadAll();
</script>
</body>
</html>`;
