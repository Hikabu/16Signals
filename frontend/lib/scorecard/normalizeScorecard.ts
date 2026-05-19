const confidenceMap: Record<string, number> = {
  low: 0.33,
  medium: 0.66,
  high: 0.9,
}

function normalizeConfidence(v: any): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return confidenceMap[v] ?? 0
  return 0
}

function normalizeScore(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function normalizeScorecard(raw: any) {

    // console.log("raw profile: ", raw.profile);
    return {
    ...raw,

    score: {
      ...raw.score,
      value: raw.score?.value,
      percentile: raw.score?.percentile,
    },

    insights: {
      ...raw.insights,

      capabilities: (raw.insights?.capabilities ?? []).map((c: any) => ({
        label: c.label,
        score: normalizeScore(c.score),
      })),

      ownership: {
        ...raw.insights?.ownership,
        confidence: normalizeConfidence(raw.insights?.ownership?.confidence),
      },

      impact: {
        ...raw.insights?.impact,
        consistency: normalizeConfidence(raw.insights?.impact?.consistency),
        confidence: normalizeConfidence(raw.insights?.impact?.confidence),
      },
    },
  }
}