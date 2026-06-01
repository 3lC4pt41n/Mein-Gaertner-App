const {
  clusterHeatmapCells,
  getHeatmapClusterStep,
  sumHeatmapDiscoveries,
  sumHeatmapSpecies,
} = require('../../utils/heatmapClustering');

describe('heatmapClustering', () => {
  it('aggregates nearby cells into one zoom-level cluster', () => {
    const clustered = clusterHeatmapCells(
      [
        { grid_lat: 52.51, grid_lon: 13.4, discovery_count: 2, species_count: 1 },
        { grid_lat: 52.53, grid_lon: 13.42, discovery_count: 3, species_count: 2 },
      ],
      0.1
    );

    expect(clustered).toHaveLength(1);
    expect(clustered[0]).toMatchObject({
      discovery_count: 5,
      species_count: 3,
      source_cells: 2,
    });
  });

  it('splits clusters again when the zoom bucket gets smaller', () => {
    const cells = [
      { grid_lat: 52.51, grid_lon: 13.4, discovery_count: 2 },
      { grid_lat: 52.53, grid_lon: 13.42, discovery_count: 3 },
    ];

    expect(clusterHeatmapCells(cells, 0.1)).toHaveLength(1);
    expect(clusterHeatmapCells(cells, 0.01)).toHaveLength(2);
  });

  it('keeps total counters based on raw cells', () => {
    const cells = [
      { grid_lat: 1, grid_lon: 1, discovery_count: 2, species_count: 3 },
      { grid_lat: 2, grid_lon: 2, discovery_count: '4', species_count: '5' },
      { grid_lat: null, grid_lon: 2, discovery_count: 10, species_count: 99 },
    ];

    expect(sumHeatmapDiscoveries(cells)).toBe(16);
    expect(sumHeatmapSpecies(cells)).toBe(107);
  });

  it('uses larger cluster buckets for lower zoom levels', () => {
    const worldStep = getHeatmapClusterStep({ latitudeDelta: 140, longitudeDelta: 160 });
    const cityStep = getHeatmapClusterStep({ latitudeDelta: 0.3, longitudeDelta: 0.3 });

    expect(worldStep).toBeGreaterThan(cityStep);
  });
});
