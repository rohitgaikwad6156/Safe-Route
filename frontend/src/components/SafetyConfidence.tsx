import { RouteData } from '../types';

interface SafetyConfidenceProps {
  route: RouteData;
}

export function SafetyConfidence({ route }: SafetyConfidenceProps) {
  if (route.score_status !== 'lower_bound') return null;

  return (
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      Estimated RSS range: {route.rss}–{route.rss_upper}. Accident data is unknown for{' '}
      {route.unknown_accident_percentage}% of this route. The gauge shows the conservative lower bound.
    </p>
  );
}
