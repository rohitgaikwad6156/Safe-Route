"""
Tests for street lighting sub-score.
Required cases: lit=yes -> lighting 100; untagged in Aundh -> 62
"""
import pytest
from backend.scoring.lighting import calculate_lighting_score


def test_lit_yes_returns_100():
    score = calculate_lighting_score(osm_lit_tag="yes")
    assert score == 100.0


def test_lit_no_returns_0():
    score = calculate_lighting_score(osm_lit_tag="no")
    assert score == 0.0


def test_untagged_in_aundh_returns_ward_density(mock_ward_lighting):
    """
    Spec worked example:
    Untagged street in Aundh ward (baseline density 62.4 poles/km) -> yields score 62.
    """
    score = calculate_lighting_score(
        osm_lit_tag=None,
        ward_name="Aundh - Baner",
        ward_lighting_map=mock_ward_lighting
    )
    assert round(score) == 62


def test_untagged_short_name_aundh(mock_ward_lighting):
    score = calculate_lighting_score(
        osm_lit_tag=None,
        ward_name="Aundh",
        ward_lighting_map=mock_ward_lighting
    )
    assert round(score) == 62


def test_untagged_unknown_ward_defaults_to_conservative_baseline():
    # Peripheral unlit zone default
    score = calculate_lighting_score(osm_lit_tag=None, ward_name="Unknown")
    assert score <= 30.0
