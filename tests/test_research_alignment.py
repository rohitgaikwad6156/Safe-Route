from datetime import datetime, timedelta
from types import SimpleNamespace
import pytest

from backend.api.server import app
from backend.routing.engine import RoutingEngine, CachedEdge
from backend.scoring.corroboration import submit_incident, HazardSnapshot, active_hazard_snapshot
from backend.scoring.context import traffic_context, night_risk_multiplier
from backend.explain.counterfactual import find_divergence_segments


def test_reporter_cannot_corroborate_their_own_report(tmp_path):
    args = dict(latitude=18.52, longitude=73.85, incident_type='broken_light',
                severity=3, reported_by='same-user', db_path=tmp_path/'reports.db')
    assert submit_incident(**args)['verification_state'] == 'unverified'
    assert submit_incident(**args)['verification_state'] == 'unverified'
    args['reported_by'] = 'independent-peer'
    assert submit_incident(**args)['verification_state'] == 'preliminary_verified'


def test_hazard_snapshot_ignores_future_and_expired_reports(tmp_path):
    now = datetime(2026, 9, 7, 12)
    path = tmp_path/'reports.db'
    for user, delta in [('expired-user', -13), ('future-user', 2)]:
        submit_incident(18.52, 73.85, 'road_damage', 5, user,
                        reported_at=now+timedelta(hours=delta), db_path=path)
    assert active_hazard_snapshot(path, now).score(18.52, 73.85) == 0


@pytest.mark.parametrize('body', [[], {'origin': None}, {'origin': {'lat': 'oops'}},
    {'origin': {'lat': 'NaN', 'lon': 73.85}, 'destination': {'lat':18.52,'lon':73.86}}])
def test_bad_route_requests_are_client_errors(body):
    assert app.test_client().post('/api/routes', json=body).status_code == 400


def test_gps_and_category_required_and_timestamp_is_server_owned():
    client=app.test_client()
    payload=dict(latitude=18.52, longitude=73.85, incident_type='broken_light',
                 severity=3, user_id_hash='research-test-session')
    assert client.post('/api/incidents',json=payload).status_code == 400
    payload.update(reporter_lat=18.52,reporter_lon=73.85,reported_at='2099-01-01T00:00:00')
    assert client.post('/api/incidents',json=payload).status_code == 201
    cells=client.get('/api/incidents').json['cells']
    assert len(cells)==1
    assert 'reported_by' not in cells[0] and 'latitude' not in cells[0]
    payload['incident_type']='made_up_category'
    assert client.post('/api/incidents',json=payload).status_code==400


def toy_engine():
    engine=RoutingEngine.__new__(RoutingEngine)
    engine.manager=SimpleNamespace(node_coords={'a':(18.52,73.85),'b':(18.5201,73.85)})
    def edge(key,length,score,lat=18.52):
        return CachedEdge('b',length,score,100-score,0,False,lat,73.85,
            {'id':key,'wsi':0,'subscores':{'traffic':80}})
    engine.adj={'a':[edge('short-dangerous',30,10),edge('long-safer',40,90)],'b':[]}
    return engine


def test_search_retains_selected_parallel_edge_and_live_hazard_changes_cost():
    engine=toy_engine()
    now=datetime(2026,9,7,12)
    ctx=engine.query_context(now,HazardSnapshot())
    fast=engine._route_fastest('a','b',ctx)
    safe=engine._route_safest('a','b',ctx)
    assert fast.edges[0].payload['id']=='short-dangerous'
    assert safe.edges[0].payload['id']=='long-safer'
    report=HazardSnapshot([(18.52,73.85,5,'preliminary_verified',now.strftime('%Y-%m-%d %H:%M:%S'))],now)
    affected=engine.query_context(now,report)
    assert engine.edge_values(safe.edges[0],ctx)[0]-engine.edge_values(safe.edges[0],affected)[0] == pytest.approx(5)


def test_research_time_context():
    assert traffic_context(datetime(2026,9,7,8)) == (20,1.7)
    assert traffic_context(datetime(2026,9,7,17)) == (20,1.8)
    assert night_risk_multiplier(datetime(2026,9,7,23)) == 1.2


def test_unknown_tags_and_wsi_do_not_invent_hazards_or_fatalities():
    fastest=[dict(id='a', length_meters=100, wsi=None, lit=None, sidewalk=None)]
    safest=[dict(id='b', length_meters=100, wsi=None)]
    detour=find_divergence_segments(fastest,safest)[0]
    assert detour['estimated_fatalities'] is None
    assert detour['unlit_percentage']==0
    assert detour['no_sidewalk_percentage']==0
    assert detour['extra_time_minutes']==0
