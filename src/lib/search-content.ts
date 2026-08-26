export type DecisionLevel = 'low' | 'medium' | 'high' | 'unknown';
export type Pace = 'slow' | 'balanced' | 'fast' | 'varied' | 'unknown';

export interface SearchContent {
  schema_version: 1;
  movie_id: string;
  generated_at: string;
  source_snapshot_hash: string;
  evidence_job_id?: string | null;
  duration_seconds?: number | null;
  sample_windows?: number | null;
  average_confidence?: number | null;
  quick_decision: {
    thesis: string;
    story_density: DecisionLevel;
    pace: Pace;
    presentation: string[];
  };
  timeline_summary?: Array<{
    phase: 'opening' | 'middle' | 'late';
    label: string;
    summary: string;
    evidence_windows: number[];
  }>;
  audience_fit: {for: string[]; not_for: string[]};
  recommendations: Array<{
    movie_id: string;
    relation_type: 'same_performer' | 'same_series' | 'adjacent_theme' | 'editorial_comparison';
    reason: string;
    shared_signals: string[];
    contrast_signals: string[];
  }>;
  questions_answered: string[];
}

const modules = import.meta.glob<{default: SearchContent}>('/data/search-content/*.json', {eager: true});
const records = new Map(
  Object.values(modules).map(({default: record}) => [record.movie_id, record]),
);

export const searchContentFor = (movieId: string) => records.get(movieId);

export const durationLabel = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours} 小時 ${minutes} 分` : `${minutes} 分鐘`;
};

export const decisionLevelLabel = (value: DecisionLevel) => ({
  low: '低', medium: '中', high: '高', unknown: '待確認',
}[value]);

export const paceLabel = (value: Pace) => ({
  slow: '慢速累積', balanced: '均衡推進', fast: '快速進入', varied: '分段變化', unknown: '待確認',
}[value]);
