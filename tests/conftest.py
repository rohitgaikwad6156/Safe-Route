"""Keep all test reports out of the user's incident database."""
import pytest
from backend.scoring import corroboration


@pytest.fixture(autouse=True)
def isolated_incident_database(tmp_path, monkeypatch):
    monkeypatch.setattr(corroboration, 'DEFAULT_DB_PATH', tmp_path / 'incidents.db')
