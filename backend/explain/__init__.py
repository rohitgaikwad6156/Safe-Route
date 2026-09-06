"""
SafeRoute AI Explanation Layer Package.
Provides counterfactual detours, attribution math, temporal causation,
honest uncertainty, and safe haven position-band coverage.
"""
from .attribution import compute_attribution
from .counterfactual import find_divergence_segments
from .temporal import analyze_temporal_causation
from .uncertainty import evaluate_uncertainty
from .safe_havens import evaluate_safe_havens, sample_route_coordinates
from .engine import ExplanationEngine

__all__ = [
    "compute_attribution",
    "find_divergence_segments",
    "analyze_temporal_causation",
    "evaluate_uncertainty",
    "evaluate_safe_havens",
    "sample_route_coordinates",
    "ExplanationEngine",
]
