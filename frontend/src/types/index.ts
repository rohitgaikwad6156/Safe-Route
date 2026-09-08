export type RouteType = 'fastest' | 'safest' | 'balanced';
export type SafetyProfileId = 'student' | 'woman_alone' | 'elderly' | 'night_commuter' | 'disability' | 'emergency_helper';
export type TravelMode = 'walking' | 'two_wheeler' | 'car';

export interface RouteRequest {
  origin: { lat: number; lon: number; name: string };
  destination: { lat: number; lon: number; name: string };
  departure_time: string;
  departure_date: string;
  profile: SafetyProfileId;
  travel_mode: TravelMode;
}

export interface RouteSubscores {
  accident: number | null;
  emergency: number;
  lighting: number;
  pedestrian: number;
  traffic: number;
}

export interface RouteStep {
  instruction: string;
  distance_meters: number;
  street: string;
}

export interface AttributionData {
  contributions: {
    accident: number;
    emergency: number;
    lighting: number;
    pedestrian: number;
    traffic: number;
  };
  subscore_means: RouteSubscores;
  raw_rss: number;
  temporal_adjustment: number;
  final_rss: number;
  explanation: string;
}

export interface CounterfactualDetour {
  block_index: number;
  avoided_length_meters: number;
  street_name: string;
  wsi_sum: number;
  estimated_fatalities: number | null;
  unlit_percentage: number;
  no_sidewalk_percentage: number;
  dominant_hazard: string;
  extra_distance_meters: number;
  extra_time_minutes: number;
  explanation: string;
}

export interface SafeHavenBand {
  band_name: string;
  sample_coordinates: [number, number];
  hospital: { name: string; distance_meters: number };
  police: { name: string; distance_meters: number };
  ecb: { name: string; distance_meters: number | null; available: boolean };
  fire?: { name: string; distance_meters: number | null; available: boolean };
}

export interface RouteWarning { type: 'blackspot' | 'lighting' | 'emergency' | 'community'; severity: string; message: string; }

export interface UncertaintyData {
  overall_confidence: 'verified' | 'estimated';
  overall_verified_percentage: number;
  lighting: {
    confidence: 'verified' | 'estimated';
    verified_percentage: number;
    verified_km: number;
    estimated_km: number;
    fallback_source: string;
  };
  pedestrian: {
    confidence: 'verified' | 'estimated';
    verified_percentage: number;
    fallback_source: string;
  };
  accident: {
    confidence: string;
    source: string;
  };
  explanation: string;
}

export interface RouteData {
  id: string;
  name: string;
  type: RouteType;
  color: string;
  distance_meters: number;
  duration_seconds: number;
  duration_label?: string;
  reference_speed_kmh?: number;
  raw_rss: number;
  score_status?: string;
  rss_upper?: number;
  unknown_accident_percentage?: number;
  community_penalty?: number;
  profile_score?: number;
  profile_recommended?: boolean;
  profile_explanation?: string;
  profile_limitation?: string;
  warnings?: RouteWarning[];
  distance_overhead_percentage?: number;
  shared_with_fastest?: boolean;
  notice?: string;
  traffic_source?: string;
  rss: number;
  risk_level: 'Safe Corridor' | 'Moderate Safety' | 'Elevated Risk' | 'High Risk';
  reasons: string[];
  subscores: RouteSubscores;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lon, lat]
  };
  steps: RouteStep[];
  attribution?: AttributionData;
  counterfactual_detours?: CounterfactualDetour[];
  uncertainty?: UncertaintyData;
  safe_havens?: {
    bands: SafeHavenBand[];
    max_hospital_distance_meters: number;
    max_police_distance_meters: number;
    nearest_hospital?: { name: string; distance_meters: number };
    nearest_police?: { name: string; distance_meters: number };
    nearest_fire?: { name: string; distance_meters: number | null; available: boolean };
    explanation: string;
  };
}

export interface RoutesResponse {
  origin: {
    name: string;
    lat: number;
    lon: number;
  };
  destination: {
    name: string;
    lat: number;
    lon: number;
  };
  departure_time: string;
  is_weekend: boolean;
  travel_mode: TravelMode;
  snap_distances_meters?: { origin: number; destination: number };
  routes: RouteData[];
}

export interface Landmark {
  name: string;
  lat: number;
  lon: number;
  category: string;
  ward?: string;
  aliases?: string[];
}

export interface HeatmapFeature {
  type: 'Feature';
  properties: {
    wsi: number;
    intensity: number;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
}

export interface IncidentReport {
  id: string;
  category: 'broken_light' | 'unsafe_location' | 'road_damage' | 'accident' | 'traffic_problem' | 'helpful_safe_place';
  severity: 1 | 2 | 3 | 4 | 5;
  description: string;
  lat: number;
  lon: number;
  timestamp: string;
  address?: string;
  demo_mode?: boolean;
}
