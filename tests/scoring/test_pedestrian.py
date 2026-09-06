"""
Tests for pedestrian infrastructure sub-score.
Required case: sidewalk=no on a trunk road -> pedestrian 0
"""
import pytest
from backend.scoring.pedestrian import calculate_pedestrian_score


def test_sidewalk_no_on_trunk_road_returns_zero():
    """
    Spec worked example:
    sidewalk=no on high-speed arterial/trunk corridors = 0
    """
    score = calculate_pedestrian_score(sidewalk_tag="no", highway_tag="trunk")
    assert score == 0.0


def test_sidewalk_no_on_motorway_and_primary_returns_zero():
    assert calculate_pedestrian_score(sidewalk_tag="none", highway_tag="primary") == 0.0
    assert calculate_pedestrian_score(sidewalk_tag="no", highway_tag="motorway") == 0.0


def test_sidewalk_both_returns_100():
    assert calculate_pedestrian_score(sidewalk_tag="both", highway_tag="primary") == 100.0
    assert calculate_pedestrian_score(sidewalk_tag="yes", highway_tag="residential") == 100.0


def test_sidewalk_one_side_returns_60():
    assert calculate_pedestrian_score(sidewalk_tag="left", highway_tag="secondary") == 60.0
    assert calculate_pedestrian_score(sidewalk_tag="right", highway_tag="tertiary") == 60.0


def test_dedicated_footway_returns_100():
    assert calculate_pedestrian_score(sidewalk_tag=None, highway_tag="footway") == 100.0
    assert calculate_pedestrian_score(sidewalk_tag=None, highway_tag="pedestrian") == 100.0
