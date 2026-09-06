"""
Tests for accident sub-score calculation.
Required case: Katraj Chowk WSI 34, WSI_max 35 -> accident sub-score == 3
"""
import pytest
from backend.scoring.accident import calculate_accident_score


def test_katraj_chowk_accident_score():
    """
    Spec worked example:
    WSI = 34, WSI_max = 35 -> S_accident = max(0, 100 - (34/35 * 100)) = 100 - 97.142857 = 2.857...
    Rounded to nearest integer == 3.
    """
    score = calculate_accident_score(wsi=34.0, wsi_max=35.0)
    assert round(score) == 3


def test_zero_wsi_is_maximally_safe():
    score = calculate_accident_score(wsi=0.0, wsi_max=35.0)
    assert score == 100.0


def test_wsi_exceeding_wsi_max_clips_to_zero():
    score = calculate_accident_score(wsi=40.0, wsi_max=35.0)
    assert score == 0.0


def test_default_wsi_max():
    # If wsi_max is not specified, uses standard default
    score = calculate_accident_score(wsi=0.0)
    assert score == 100.0
