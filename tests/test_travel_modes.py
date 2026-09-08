import pytest
from datetime import datetime
from types import SimpleNamespace

from backend.api import server
from backend.routing.engine import CachedEdge, RoutingEngine
from backend.routing.travel_modes import (
    REFERENCE_SPEEDS_KMH,
    edge_is_allowed,
    estimate_duration_seconds,
    get_travel_mode_profile,
)
from backend.scoring.corroboration import HazardSnapshot


VALID_ROUTE_REQUEST = {
    'origin': {'lat': 18.5200, 'lon': 73.8500, 'name': 'Origin'},
    'destination': {'lat': 18.5210, 'lon': 73.8510, 'name': 'Destination'},
    'departure_time': '21:30',
    'departure_date': '2026-09-08',
    'profile': 'student',
}


@pytest.mark.parametrize('travel_mode', ['walking', 'two_wheeler', 'car'])
def test_route_endpoint_passes_supported_travel_mode_to_engine(monkeypatch, travel_mode):
    received = {}

    class FakeRoutingEngine:
        def calculate_routes(self, **kwargs):
            received.update(kwargs)
            return {'routes': [], 'travel_mode': kwargs['travel_mode']}

    monkeypatch.setattr(server, 'get_routing_engine', lambda: FakeRoutingEngine())
    response = server.app.test_client().post(
        '/api/routes',
        json={**VALID_ROUTE_REQUEST, 'travel_mode': travel_mode},
    )

    assert response.status_code == 200
    assert received['travel_mode'] == travel_mode
    assert response.json['travel_mode'] == travel_mode


def test_route_endpoint_defaults_missing_travel_mode_to_walking(monkeypatch):
    received = {}

    class FakeRoutingEngine:
        def calculate_routes(self, **kwargs):
            received.update(kwargs)
            return {'routes': [], 'travel_mode': kwargs['travel_mode']}

    monkeypatch.setattr(server, 'get_routing_engine', lambda: FakeRoutingEngine())
    response = server.app.test_client().post('/api/routes', json=VALID_ROUTE_REQUEST)

    assert response.status_code == 200
    assert received['travel_mode'] == 'walking'


@pytest.mark.parametrize('travel_mode', ['bike', 'WALKING', '', 123, False])
def test_route_endpoint_rejects_invalid_travel_mode(travel_mode):
    response = server.app.test_client().post(
        '/api/routes',
        json={**VALID_ROUTE_REQUEST, 'travel_mode': travel_mode},
    )

    assert response.status_code == 400
    assert response.json['error'] == 'invalid_travel_mode'
    assert response.json['supported_travel_modes'] == ['car', 'two_wheeler', 'walking']


def _edge(edge_id, *, highway='residential', sidewalk='', length=100, **overrides):
    payload = {
        'id': edge_id,
        'wsi': 0,
        'highway': highway,
        'sidewalk': sidewalk,
        'crossing': '',
        'junction_degree': 2,
        'node_highway': '',
        'maxspeed': '',
        'surface': 'asphalt',
        'smoothness': 'good',
        'access': '',
        'foot': '',
        'motorroad': '',
        'motor_vehicle': '',
        'motorcycle': '',
        'motorcar': '',
        'subscores': {
            'accident': 80, 'emergency': 80, 'lighting': 80,
            'pedestrian': 50, 'traffic': 80,
        },
    }
    subscores = overrides.pop('subscores', None)
    payload.update(overrides)
    if subscores:
        payload['subscores'].update(subscores)
    return CachedEdge('b', length, 80, 20, 0, False, 18.52, 73.85, payload)


def _mode_route(edges, travel_mode, variant='safest'):
    engine = RoutingEngine.__new__(RoutingEngine)
    engine.manager = SimpleNamespace(node_coords={'a': (18.52, 73.85), 'b': (18.521, 73.85)})
    engine.adj = {'a': edges, 'b': []}
    context = engine.query_context(datetime(2026, 9, 8, 12), HazardSnapshot(), travel_mode)
    return getattr(engine, f'_route_{variant}')('a', 'b', context)


def test_walking_route_prefers_pedestrian_infrastructure_and_lower_speed():
    arterial = _edge(
        'arterial', highway='primary', sidewalk='no', maxspeed='80',
        subscores={'accident': 85, 'lighting': 65, 'pedestrian': 5},
    )
    pedestrian_friendly = _edge(
        'pedestrian-friendly', highway='residential', sidewalk='both',
        crossing='traffic_signals', maxspeed='30',
        subscores={'accident': 75, 'lighting': 90, 'pedestrian': 100},
    )
    path = _mode_route([arterial, pedestrian_friendly], 'walking')
    assert path.edges[0].payload['id'] == 'pedestrian-friendly'


def test_two_wheeler_route_prioritizes_crash_lighting_junction_and_condition_risk():
    risky = _edge(
        'risky-junction', highway='primary', maxspeed='80', smoothness='bad',
        junction_degree=5, subscores={'accident': 15, 'lighting': 20},
    )
    safer = _edge(
        'safer-surface', highway='secondary', maxspeed='40', smoothness='good',
        junction_degree=2, subscores={'accident': 90, 'lighting': 90},
    )
    path = _mode_route([risky, safer], 'two_wheeler')
    assert path.edges[0].payload['id'] == 'safer-surface'


def test_car_route_favors_valid_vehicle_road_class_not_sidewalk_score():
    sidewalk_route = _edge(
        'sidewalk-residential', highway='residential', sidewalk='both',
        subscores={'pedestrian': 100},
    )
    vehicle_route = _edge(
        'vehicle-primary', highway='primary', sidewalk='no', maxspeed='50',
        subscores={'pedestrian': 0},
    )
    car_path = _mode_route([sidewalk_route, vehicle_route], 'car')
    walking_path = _mode_route([sidewalk_route, vehicle_route], 'walking')
    assert car_path.edges[0].payload['id'] == 'vehicle-primary'
    assert walking_path.edges[0].payload['id'] == 'sidewalk-residential'


def test_mode_access_rules_filter_explicit_osm_restrictions():
    foot_restricted = _edge('no-foot', foot='no')
    footway = _edge('footway', highway='footway')
    assert not edge_is_allowed(foot_restricted.payload, 'walking')
    assert not edge_is_allowed(footway.payload, 'car')
    assert not edge_is_allowed(footway.payload, 'two_wheeler')


def test_engine_profile_lookup_rejects_invalid_mode():
    with pytest.raises(ValueError, match='Unsupported travel mode'):
        get_travel_mode_profile('bike')


def test_reference_speeds_are_mode_specific_and_explicitly_configured():
    assert 4.0 <= REFERENCE_SPEEDS_KMH['walking'] <= 5.0
    assert REFERENCE_SPEEDS_KMH['walking'] < REFERENCE_SPEEDS_KMH['two_wheeler']
    assert REFERENCE_SPEEDS_KMH['two_wheeler'] < REFERENCE_SPEEDS_KMH['car']


def test_backend_duration_estimate_depends_on_travel_mode():
    durations = {
        mode: estimate_duration_seconds(1_000, mode)
        for mode in ('walking', 'two_wheeler', 'car')
    }
    assert durations == {'walking': 766, 'two_wheeler': 144, 'car': 120}
    assert len(set(durations.values())) == 3


def test_simulated_congestion_multiplier_changes_vehicle_estimate_without_claiming_live_speed():
    baseline = estimate_duration_seconds(1_000, 'car')
    assert estimate_duration_seconds(1_000, 'car', 1.8) == round(baseline * 1.8)


@pytest.mark.parametrize(
    ('travel_mode', 'expected_duration', 'expected_speed'),
    [
        ('walking', 766, 4.7),
        ('two_wheeler', 144, 25.0),
        ('car', 120, 30.0),
    ],
)
def test_backend_route_data_returns_mode_specific_estimated_time(
    travel_mode, expected_duration, expected_speed,
):
    engine = RoutingEngine.__new__(RoutingEngine)
    engine.manager = SimpleNamespace(node_coords={'a': (18.52, 73.85), 'b': (18.521, 73.85)})
    engine.adj = {'a': [_edge('one-kilometre', length=1_000)], 'b': []}
    engine._mode_edge_cache = {}
    departure = datetime(2026, 9, 8, 12)
    context = engine.query_context(departure, HazardSnapshot(), travel_mode)
    path = engine._route_fastest('a', 'b', context)

    route = engine._build_route_data(
        path, 'route-test', 'Test route', 'fastest', '#000000', departure,
    )

    assert route['duration_seconds'] == expected_duration
    assert route['duration_label'] == 'Estimated time'
    assert route['reference_speed_kmh'] == expected_speed
    assert 'not live traffic' in route['traffic_source']
