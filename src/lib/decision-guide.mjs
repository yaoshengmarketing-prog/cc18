const present = (values) => Array.isArray(values) ? values.filter(Boolean) : [];

export function decisionGuideViewModel(content, timeline = []) {
  const quickDecision = content?.quick_decision ?? null;
  const thesis = typeof quickDecision?.thesis === 'string' ? quickDecision.thesis.trim() : '';
  const presentation = present(quickDecision?.presentation);
  const audienceFor = present(content?.audience_fit?.for);
  const audienceNotFor = present(content?.audience_fit?.not_for);
  const recommendations = present(content?.recommendations);
  const safeTimeline = present(timeline);
  const hasMetrics = Boolean(quickDecision?.story_density || quickDecision?.pace || presentation.length);
  return {
    quickDecision,
    thesis,
    presentation,
    audienceFor,
    audienceNotFor,
    recommendations,
    timeline: safeTimeline,
    hasMetrics,
    hasContent: Boolean(thesis || hasMetrics || safeTimeline.length || audienceFor.length || audienceNotFor.length || recommendations.length),
  };
}
