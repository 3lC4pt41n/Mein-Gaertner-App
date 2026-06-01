const CLUSTER_STEPS_BY_DELTA = [
  { minDelta: 140, step: 45 },
  { minDelta: 80, step: 25 },
  { minDelta: 45, step: 10 },
  { minDelta: 22, step: 5 },
  { minDelta: 10, step: 2 },
  { minDelta: 5, step: 1 },
  { minDelta: 2.5, step: 0.5 },
  { minDelta: 1, step: 0.25 },
  { minDelta: 0.45, step: 0.1 },
  { minDelta: 0.18, step: 0.05 },
  { minDelta: 0, step: 0.01 },
];

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCoord(value) {
  return Number(value.toFixed(6));
}

function bucketFor(value, step) {
  return roundCoord(Math.floor(value / step) * step);
}

export function getHeatmapClusterStep(region) {
  const latitudeDelta = toFiniteNumber(region?.latitudeDelta);
  const longitudeDelta = toFiniteNumber(region?.longitudeDelta);
  const maxDelta = Math.max(latitudeDelta ?? 180, longitudeDelta ?? 360);
  return CLUSTER_STEPS_BY_DELTA.find(({ minDelta }) => maxDelta >= minDelta)?.step ?? 0.01;
}

export function sumHeatmapDiscoveries(cells) {
  return (cells || []).reduce((sum, cell) => sum + (toFiniteNumber(cell?.discovery_count) || 0), 0);
}

export function sumHeatmapSpecies(cells) {
  return (cells || []).reduce((sum, cell) => sum + (toFiniteNumber(cell?.species_count) || 0), 0);
}

export function clusterHeatmapCells(cells, clusterStep = 0.01) {
  const step = toFiniteNumber(clusterStep) || 0.01;
  const clusters = new Map();

  for (const cell of cells || []) {
    const latitude = toFiniteNumber(cell?.grid_lat);
    const longitude = toFiniteNumber(cell?.grid_lon);
    const discoveryCount = toFiniteNumber(cell?.discovery_count) || 0;

    if (latitude == null || longitude == null || discoveryCount <= 0) continue;

    const latBucket = bucketFor(latitude, step);
    const lonBucket = bucketFor(longitude, step);
    const key = `${step}:${latBucket}:${lonBucket}`;
    const existing = clusters.get(key) || {
      key,
      discovery_count: 0,
      species_count: 0,
      first_discoveries: 0,
      source_cells: 0,
      weighted_lat: 0,
      weighted_lon: 0,
    };

    existing.discovery_count += discoveryCount;
    existing.species_count += toFiniteNumber(cell?.species_count) || 0;
    existing.first_discoveries += toFiniteNumber(cell?.first_discoveries) || 0;
    existing.source_cells += 1;
    existing.weighted_lat += latitude * discoveryCount;
    existing.weighted_lon += longitude * discoveryCount;
    clusters.set(key, existing);
  }

  return Array.from(clusters.values())
    .map((cluster) => ({
      key: cluster.key,
      grid_lat: roundCoord(cluster.weighted_lat / cluster.discovery_count),
      grid_lon: roundCoord(cluster.weighted_lon / cluster.discovery_count),
      discovery_count: cluster.discovery_count,
      species_count: cluster.species_count,
      first_discoveries: cluster.first_discoveries,
      source_cells: cluster.source_cells,
    }))
    .sort((a, b) => a.discovery_count - b.discovery_count);
}
