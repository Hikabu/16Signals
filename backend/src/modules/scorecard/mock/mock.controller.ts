import { Controller, Get, Header, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalysisResult } from '../../../modules/scoring/types/result.types';
import {
  CachedScorecard,
  ViewData,
  PrimitiveResult,
} from '../../analysis/llm/llm-response.types';
import { SCORING_SCHEMA_VERSION } from 'src/modules/scoring/constants';

// ═════════════════════════════════════════════════════════════════════
// Legacy AnalysisResult fixtures (backward compat)
// ═════════════════════════════════════════════════════════════════════

const MOCK_GITHUB_ONLY: AnalysisResult = {
  summary: 'Backend-focused developer who actively maintains a solid portfolio of 4 projects.',
  capabilities: { backend: { score: 0.82, confidence: 'high' }, frontend: { score: 0.31, confidence: 'low' }, devops: { score: 0.54, confidence: 'medium' } },
  ownership: { ownedProjects: 12, activelyMaintained: 4, confidence: 'high' },
  impact: { activityLevel: 'high', consistency: 'strong', externalContributions: 7, confidence: 'high' },
  reputation: null, organizations: [], interactionProfile: null,
  stack: { languages: ['TypeScript', 'Rust', 'Go'], tools: ['Docker', 'Prisma', 'Redis'] },
  web3: null, schemaVersion: SCORING_SCHEMA_VERSION,
};

const MOCK_WALLET: AnalysisResult = {
  summary: 'Backend-focused developer. Active in Solana ecosystem. Superteam contributor (3 completions).',
  capabilities: { backend: { score: 0.87, confidence: 'high' }, frontend: { score: 0.22, confidence: 'low' }, devops: { score: 0.51, confidence: 'medium' } },
  ownership: { ownedProjects: 12, activelyMaintained: 4, confidence: 'high' },
  impact: { activityLevel: 'high', consistency: 'strong', externalContributions: 7, confidence: 'high' },
  reputation: null, organizations: [], interactionProfile: null,
  stack: { languages: ['Rust', 'TypeScript', 'Go'], tools: ['Anchor', 'Docker', 'Prisma', 'Redis'] },
  web3: { ecosystem: 'solana', ecosystemPRs: 3, deployedPrograms: [{ programId: 'Fg6PaFpo', deployedAt: '2023-06-15T10:00:00.000Z', isActive: true, uniqueCallers: 142, upgradeCount: 11 }] },
  schemaVersion: SCORING_SCHEMA_VERSION,
};

const MOCK_WALLET_ONLY: AnalysisResult = {
  summary: 'Developer with backend focus. Solana ecosystem.',
  capabilities: { backend: { score: 0.5, confidence: 'medium' }, frontend: { score: 0.1, confidence: 'low' }, devops: { score: 0.3, confidence: 'low' } },
  ownership: { ownedProjects: 0, activelyMaintained: 0, confidence: 'low' },
  impact: { activityLevel: 'medium', consistency: 'moderate', externalContributions: 0, confidence: 'low' },
  stack: { languages: ['Rust'], tools: ['Anchor'] },
  reputation: null, organizations: [], interactionProfile: null,
  web3: { ecosystem: 'solana', ecosystemPRs: 0, deployedPrograms: [{ programId: 'Fg6PaFpo', deployedAt: '2024-03-01T00:00:00.000Z', isActive: true, uniqueCallers: 19, upgradeCount: 7 }] },
  schemaVersion: SCORING_SCHEMA_VERSION,
};

// ═════════════════════════════════════════════════════════════════════
// New 7-Primitive CachedScorecard fixtures
// ═════════════════════════════════════════════════════════════════════

function makePrimitives(mode: 'light' | 'deep'): PrimitiveResult[] {
  return [
    { primitive_id: 'p1', module_id: 'p1_execution_reliability', confidence: mode === 'deep' ? 'strong' : 'moderate', score_label: 'Consistent shipping cadence', evidence_count: mode === 'deep' ? 8 : 4, interview_probe: null },
    { primitive_id: 'p2', module_id: 'p2_systems_evolution', confidence: mode === 'deep' ? 'moderate' : 'low', score_label: 'Limited refactoring visible', evidence_count: mode === 'deep' ? 5 : 2, interview_probe: 'Can you describe a major refactor you led?' },
    { primitive_id: 'p3', module_id: 'p3_collaboration_leverage', confidence: 'strong', score_label: 'Active code reviewer', evidence_count: 6, interview_probe: null },
    { primitive_id: 'p4', module_id: 'p4_technical_depth', confidence: mode === 'deep' ? 'strong' : 'moderate', score_label: 'Demonstrated in Rust and TypeScript', evidence_count: mode === 'deep' ? 9 : 5, interview_probe: null },
    { primitive_id: 'p5', module_id: 'p5_operational_maturity', confidence: mode === 'deep' ? 'moderate' : 'observability_gap', score_label: 'No public CI/CD signals', evidence_count: mode === 'deep' ? 3 : 0, interview_probe: 'How do you handle production incidents?' },
    { primitive_id: 'p6', module_id: 'p6_ai_leverage_quality', confidence: 'moderate', score_label: 'AI-assisted with refinement', evidence_count: 4, interview_probe: null },
    { primitive_id: 'p7', module_id: 'p7_authenticity_confidence', confidence: 'strong', score_label: 'Clean history, no gaming detected', evidence_count: 5, interview_probe: null },
  ];
}

function makeViewData(mode: 'light' | 'deep'): ViewData {
  return {
    jobId: `mock_${mode}_abc123`,
    analyzedAt: new Date().toISOString(),
    primitives: makePrimitives(mode),
    primitiveScores: { p1: 90, p2: 35, p3: 90, p4: mode === 'deep' ? 90 : 65, p5: mode === 'deep' ? 65 : 0, p6: 65, p7: 90 },
    flags: [
      { flag_id: 'OBS_GAP_P5', flag_type: 'SOFT', severity: 'INFO', module_id: 'p5_operational_maturity', description: 'No public CI/CD configuration found', escalate_to_hiring_manager: false, clear_without_interview: true, interview_probe: 'How do you manage CI/CD pipelines?' },
    ],
    flagCount: 1,
    sections: {
      A: 'Backend-focused engineer with strong Rust and TypeScript skills. Consistent shipping cadence across multiple repositories.',
      B: 'No CV claims provided.',
      C: 'Steady contribution pattern. Detailed PR descriptions. Mentorship-quality code reviews.',
      D: '**No flags detected.**',
      E: '### Technical Judgment\n**Question:** How would you design a rate-limiting system?\n*Source: p4*',
      F: null,
      G: 'Cannot assess: private work, soft skills, performance under pressure, cultural fit.',
    },
    interviewQuestions: [
      { type: 'technical_judgment', question: 'How would you design a rate-limiting system for a distributed API?', source_primitive: 'p4', evaluation_criteria: 'Distributed systems tradeoffs, token bucket vs sliding window.' },
      { type: 'experience_depth', question: 'Describe a major refactor you led.', source_primitive: 'p2', evaluation_criteria: 'Systems thinking, stakeholder communication.' },
      { type: 'team_collaboration', question: 'How do you approach code reviews for juniors?', source_primitive: 'p3', evaluation_criteria: 'Teaching mindset, constructive feedback.' },
    ],
    metadata: { username: 'mockuser', mode, generatedAt: new Date().toISOString(), schemaVersion: 'gitintel_v1.0', seniority: 'senior', roleArchetype: 'backend', cvClaimsCount: 0, totalDurationMs: 45000 },
  };
}

const MOCK_SCORECARD: CachedScorecard = {
  lastAnalysisJobId: 'light_mock_abc123',
  lastAnalysisMode: 'light',
  lastAnalyzedAt: new Date().toISOString(),
  snapshot: { username: 'mockuser', techStack: { languages: ['TypeScript', 'Rust', 'Go'], tools: ['Docker', 'Prisma', 'Redis'] }, archetypeSummary: 'Backend-focused engineer with strong collaboration and consistent shipping.', evRung: 1 },
  light: makeViewData('light'),
  deep: makeViewData('deep'),
};

const MOCK_SCORECARD_WALLET_ONLY: CachedScorecard = {
  lastAnalysisJobId: 'deep_mock_wallet',
  lastAnalysisMode: 'deep',
  lastAnalyzedAt: new Date().toISOString(),
  snapshot: { username: 'walletuser', techStack: { languages: ['Rust'], tools: ['Anchor'] }, archetypeSummary: 'On-chain developer with deployed Solana programs.', evRung: 0 },
  light: null,
  deep: makeViewData('deep'),
};

// ═════════════════════════════════════════════════════════════════════
// Controller
// ═════════════════════════════════════════════════════════════════════

@ApiTags('Mock / Dev Reference')
@Controller('api/mock')
export class MockController {
  @Get('scorecard/light')
  @ApiOperation({ summary: '[MOCK] 7-Primitive Scorecard (Light Mode)' })
  getScorecardLight(): CachedScorecard { return MOCK_SCORECARD; }

  @Get('scorecard/wallet-only')
  @ApiOperation({ summary: '[MOCK] 7-Primitive Scorecard (Wallet Only)' })
  getScorecardWalletOnly(): CachedScorecard { return MOCK_SCORECARD_WALLET_ONLY; }

  @Get('analysis/wallet')
  @ApiOperation({ summary: '[LEGACY] GitHub + Solana wallet', deprecated: true })
  getWallet(): AnalysisResult { return MOCK_WALLET; }

  @Get('analysis/github-only')
  @ApiOperation({ summary: '[LEGACY] GitHub-only', deprecated: true })
  getGithubOnly(): AnalysisResult { return MOCK_GITHUB_ONLY; }

  @Get('analysis/wallet-only')
  @ApiOperation({ summary: '[LEGACY] Wallet-only', deprecated: true })
  getWalletOnly(): AnalysisResult { return MOCK_WALLET_ONLY; }

  @Get('analysis')
  @ApiOperation({ summary: '[MOCK] All fixtures' })
  getAll(): Record<string, unknown> {
    return {
      'scorecard-light': MOCK_SCORECARD,
      'scorecard-wallet-only': MOCK_SCORECARD_WALLET_ONLY,
      'github-only': MOCK_GITHUB_ONLY,
      wallet: MOCK_WALLET,
      'wallet-only': MOCK_WALLET_ONLY,
    };
  }

  @Get('viewer')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: '[MOCK] API Viewer page' })
  getViewer(@Res() res: Response): void { res.status(HttpStatus.OK).send(VIEWER_HTML); }
}

// ─────────────────────────────────────────────────────────────
// HTML viewer page
// ─────────────────────────────────────────────────────────────
const VIEWER_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>API Mock Viewer</title>
<style>
:root{--bg:#0a0a0f;--surface:#12121a;--surface2:#1a1a26;--border:#252535;--accent:#7c3aed;--green:#10b981;--amber:#f59e0b;--red:#ef4444;--text:#e2e8f0;--muted:#64748b}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:Inter,sans-serif;min-height:100vh;line-height:1.6}
nav{position:sticky;top:0;z-index:50;background:rgba(10,10,15,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:0 2rem;display:flex;align-items:center;gap:2rem;height:56px}
.nav-logo{font-size:.9rem;font-weight:700;color:var(--accent);text-transform:uppercase}
.nav-tabs{display:flex;gap:4px;margin-left:auto}
.tab-btn{padding:6px 16px;border-radius:8px;font-size:.82rem;font-weight:500;background:0 0;border:1px solid transparent;color:var(--muted);cursor:pointer}
.tab-btn.active,.tab-btn:hover{color:var(--text);background:var(--surface2)}
.tab-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
main{max-width:1400px;margin:0 auto;padding:2.5rem 2rem}
.panel-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.panel-header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.panel-title{font-size:.85rem;font-weight:600}
.tab-content{display:none}.tab-content.active{display:block}
.stat-row{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid var(--border)}
.stat-row:last-child{border-bottom:none}
.stat-label{font-size:.82rem;color:var(--muted)}
.stat-value{font-size:.82rem;font-weight:600;font-family:'JetBrains Mono',monospace}
.bar-wrap{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--border)}
.bar-wrap:last-child{border-bottom:none}
.bar-name{font-size:.78rem;width:100px;color:var(--muted)}
.bar-track{flex:1;height:6px;background:var(--surface2);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-pct{font-size:.72rem;font-family:'JetBrains Mono',monospace;width:36px;text-align:right}
.tag-list{display:flex;flex-wrap:wrap;gap:6px;padding:14px 18px}
.tag{font-size:.72rem;font-weight:500;padding:3px 10px;border-radius:6px;background:#1e1e30;border:1px solid var(--border);color:var(--text)}
.summary-box{margin:18px;padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:.85rem;line-height:1.7}
.conf-strong{color:var(--green)}.conf-moderate{color:var(--amber)}.conf-low,.conf-observability_gap,.conf-insufficient_data{color:var(--red)}
.endpoint-pill{display:inline-flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:.8rem;margin-bottom:1rem}
.page-header{margin-bottom:2rem}.page-title{font-size:1.5rem;font-weight:700}
.page-desc{color:var(--muted);font-size:.9rem}
pre{padding:18px;font-family:'JetBrains Mono',monospace;font-size:.72rem;line-height:1.65;white-space:pre-wrap;color:#a5b4fc;background:#0d0d18;margin:0;height:100%}
</style>
</head>
<body>
<nav><span class="nav-logo">16Signals</span><span style="font-size:.7rem;color:var(--muted)">Mock API Viewer</span>
<div class="nav-tabs">
<button class="tab-btn active" onclick="switchTab('scorecard-light')">Scorecard (Light)</button>
<button class="tab-btn" onclick="switchTab('scorecard-deep')">Scorecard (Deep)</button>
<button class="tab-btn" onclick="switchTab('wallet')">Legacy Wallet</button>
<button class="tab-btn" onclick="switchTab('json')">Raw JSON</button>
</div></nav>
<main>
<div class="page-header"><h1 class="page-title">Mock API Viewer</h1><p class="page-desc">7-Primitive scorecard + legacy fixtures</p></div>
<div id="tab-scorecard-light" class="tab-content active"><div class="endpoint-pill"><span style="color:var(--green);font-weight:600">GET</span> <span style="font-family:monospace">/api/mock/scorecard/light</span></div><div class="panel-grid" id="sc-light-grid"></div></div>
<div id="tab-scorecard-deep" class="tab-content"><div class="endpoint-pill"><span style="color:var(--green);font-weight:600">GET</span> <span style="font-family:monospace">/api/mock/scorecard/light → deep</span></div><div class="panel-grid" id="sc-deep-grid"></div></div>
<div id="tab-wallet" class="tab-content"><div class="endpoint-pill"><span style="color:var(--green);font-weight:600">GET</span> <span style="font-family:monospace">/api/mock/analysis/wallet</span></div><div class="panel-grid" id="wallet-grid"></div></div>
<div id="tab-json" class="tab-content"><div class="endpoint-pill"><span style="color:var(--green);font-weight:600">GET</span> <span style="font-family:monospace">/api/mock/analysis</span></div><div class="panel"><div class="panel-header"><span class="panel-title">All Fixtures</span></div><pre id="json-display">Loading…</pre></div></div>
</main>
<script>
let FIXTURES={};
async function load(){const r=await fetch('/api/mock/analysis');FIXTURES=await r.json();renderTab('scorecard-light');document.getElementById('json-display').textContent=JSON.stringify(FIXTURES,null,2)}
function switchTab(n){document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));document.getElementById('tab-'+n).classList.add('active');renderTab(n)}
function renderTab(n){
if(n==='scorecard-light'){document.getElementById('sc-light-grid').innerHTML=renderScorecard(FIXTURES['scorecard-light'],'light')}
if(n==='scorecard-deep'){document.getElementById('sc-deep-grid').innerHTML=renderScorecard(FIXTURES['scorecard-light'],'deep')}
if(n==='wallet'){document.getElementById('wallet-grid').innerHTML=renderLegacy(FIXTURES['wallet'])}
}
function renderScorecard(sc,mode){
const vd=mode==='light'?sc.light:sc.deep;
const primitives=(vd.primitives||[]).map(p=>{
const pct=p.confidence==='strong'?90:p.confidence==='moderate'?65:p.confidence==='low'?35:p.confidence==='observability_gap'?10:5;
const color=p.confidence==='strong'?'var(--green)':p.confidence==='moderate'?'var(--amber)':p.confidence==='observability_gap'?'var(--muted)':'var(--red)';
return '<div class="bar-wrap"><span class="bar-name">'+p.primitive_id.toUpperCase()+'</span><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div><span class="bar-pct">'+pct+'%</span><span class="conf-'+p.confidence+'">'+p.confidence+'</span></div>';
}).join('');
const languages=(sc.snapshot.techStack.languages||[]).map(l=>'<span class="tag">'+l+'</span>').join('');
const tools=(sc.snapshot.techStack.tools||[]).map(t=>'<span class="tag">'+t+'</span>').join('');
return '<div class="panel"><div class="panel-header"><span class="panel-title">\u{1F3AF} 7 Primitives ('+mode+' mode)</span></div>'+primitives+'</div>'+
'<div class="panel"><div class="panel-header"><span class="panel-title">\u{1F527} Tech Stack</span></div><div class="tag-list">'+languages+tools+'</div>'+
'<div class="stat-row"><span class="stat-label">Flags</span><span class="stat-value">'+(vd.flagCount||0)+'</span></div>'+
'<div class="stat-row"><span class="stat-label">Questions</span><span class="stat-value">'+(vd.interviewQuestions||[]).length+'</span></div>'+
'<div class="summary-box"><strong>Archetype:</strong> '+sc.snapshot.archetypeSummary+'</div></div>';
}
function renderLegacy(d){
const caps=['backend','frontend','devops'].map(k=>{const s=d.capabilities[k];const pct=Math.round(s.score*100);const color=pct>65?'var(--accent)':pct>35?'var(--green)':'var(--muted)';return'<div class="bar-wrap"><span class="bar-name">'+k+'</span><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div><span class="bar-pct">'+pct+'%</span></div>'}).join('');
const langs=(d.stack.languages||[]).map(l=>'<span class="tag">'+l+'</span>').join('');
const tools=(d.stack.tools||[]).map(t=>'<span class="tag">'+t+'</span>').join('');
return '<div class="panel"><div class="panel-header"><span class="panel-title">Legacy Capabilities</span></div>'+caps+'</div>'+
'<div class="panel"><div class="panel-header"><span class="panel-title">Tech Stack</span></div><div class="tag-list">'+langs+tools+'</div>'+
'<div class="stat-row"><span class="stat-label">Owned Projects</span><span class="stat-value">'+d.ownership.ownedProjects+'</span></div>'+
'<div class="summary-box">'+d.summary+'</div></div>';
}
load();
</script>
</body></html>`;