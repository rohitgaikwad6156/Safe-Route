"""Offline-only city data refresh. Stage output for validation before activation."""
import json
import pickle
from pathlib import Path
from datetime import datetime, timezone
import networkx as nx
import osmnx as ox

OUT = Path(__file__).resolve().parents[1] / 'backend/data/pune_expanded'
BBOX = (73.65, 18.35, 74.10, 18.80)

def main():
    OUT.mkdir(exist_ok=True)
    ox.settings.log_console = True
    ox.settings.requests_timeout = 300
    ox.settings.useful_tags_way = list(set(ox.settings.useful_tags_way + ['lit', 'sidewalk', 'width', 'lanes', 'crossing', 'foot', 'access']))
    graph_path = OUT / 'pune_graph.pkl'
    if not graph_path.exists():
        graph = ox.graph_from_bbox(BBOX, network_type='all', simplify=True, retain_all=False)
        graph = nx.relabel_nodes(graph, str)
        # Keep the portable cold-start source synchronized with the fast cache.
        ox.io.save_graphml(graph, OUT / 'pune_graph.graphml')
        # Runtime cache uses WKT, not Shapely objects.
        for _, _, _, edge in graph.edges(keys=True, data=True):
            if 'geometry' in edge:
                edge['geometry'] = edge['geometry'].wkt
        with graph_path.open('wb') as file:
            pickle.dump(graph, file, protocol=pickle.HIGHEST_PROTOCOL)
    features = ox.features_from_bbox(BBOX, tags={
        'amenity': ['hospital', 'clinic', 'police', 'fire_station'],
        'highway': ['street_lamp', 'crossing', 'traffic_signals', 'emergency_access_point'],
        'emergency': ['phone', 'defibrillator', 'ambulance_station'],
    })
    categories = {'hospital':'hospitals', 'clinic':'clinics', 'police':'police', 'fire_station':'fire_stations',
                  'street_lamp':'street_lamps', 'crossing':'crossings', 'traffic_signals':'traffic_signals',
                  'emergency_access_point':'emergency_access_points', 'phone':'ecbs',
                  'defibrillator':'defibrillators', 'ambulance_station':'ambulance_stations'}
    amenities = {category: [] for category in categories.values()}
    for (kind, osm_id), row in features.iterrows():
        category_tag = next((row.get(key) for key in ('amenity','highway','emergency') if row.get(key) in categories), None)
        if category_tag is None: continue
        point = row.geometry.representative_point()
        name = row.get('name')
        amenities[categories[category_tag]].append({'id':f'osm_{kind}_{osm_id}', 'lat':point.y, 'lon':point.x,
            'name':name if isinstance(name,str) else category_tag.replace('_',' ').title(), 'type':category_tag,
            'source_url':f'https://www.openstreetmap.org/{kind}/{osm_id}'})
    (OUT/'amenities.json').write_text(json.dumps(amenities, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT/'manifest.json').write_text(json.dumps({'bbox': BBOX, 'retrieved_at':datetime.now(timezone.utc).isoformat(),
        'source':'OpenStreetMap contributors', 'license':'ODbL 1.0', 'counts':{k:len(v) for k,v in amenities.items()}},indent=2))
    print('Staged expanded graph and amenities:', OUT)

if __name__ == '__main__': main()
