import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from '../../supabase';

const {
  getDiscoveryLocation,
  resolveSpeciesWithoutDiscovery,
} = require('../../services/discoveryService');

describe('discoveryService', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalPlatformOS,
    });
  });

  describe('getDiscoveryLocation', () => {
    it('uses the shared weather location cache when it is fresh', async () => {
      await AsyncStorage.setItem(
        '@user_location',
        JSON.stringify({
          latitude: 52.52,
          longitude: 13.405,
          timestamp: Date.now(),
        })
      );

      const result = await getDiscoveryLocation();

      expect(result).toEqual({ latitude: 52.52, longitude: 13.405 });
      expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it('requests foreground permission before reading GPS when cache is missing', async () => {
      Location.getForegroundPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 48.137, longitude: 11.575 },
      });

      const result = await getDiscoveryLocation();

      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({
        accuracy: Location.Accuracy.Balanced,
        timeout: 5000,
      });
      expect(result).toEqual({ latitude: 48.137, longitude: 11.575 });
      await expect(AsyncStorage.getItem('@user_location')).resolves.toContain('48.137');
    });

    it('returns null without GPS lookup when permission is denied', async () => {
      Location.getForegroundPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await getDiscoveryLocation();

      expect(result).toBeNull();
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it('returns null on web without reading location APIs or cache', async () => {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        get: () => 'web',
      });
      await AsyncStorage.setItem(
        '@user_location',
        JSON.stringify({
          latitude: 52.52,
          longitude: 13.405,
          timestamp: Date.now(),
        })
      );

      const result = await getDiscoveryLocation();

      expect(result).toBeNull();
      expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });
  });

  describe('resolveSpeciesWithoutDiscovery', () => {
    it('returns an existing species without inserting a discovery event', async () => {
      const speciesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: 'species-1',
            first_discovered_by: 'user-1',
            total_discoverers: 3,
            plant_type: 'tree',
          },
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(speciesQuery);

      const result = await resolveSpeciesWithoutDiscovery('Monstera Deliciosa', null);

      expect(result).toEqual({
        speciesId: 'species-1',
        displayName: 'Monstera Deliciosa',
        totalDiscoverers: 3,
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
      expect(supabase.from).not.toHaveBeenCalledWith('discovery_events');
      expect(supabase.rpc).not.toHaveBeenCalledWith('award_discovery_credits', expect.anything());
    });

    it('creates a species without first-discovery metadata for web uploads', async () => {
      const speciesLookup = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      const speciesInsert = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'species-new', total_discoverers: 0 },
          error: null,
        }),
      };
      supabase.from.mockReturnValueOnce(speciesLookup).mockReturnValueOnce(speciesInsert);

      const result = await resolveSpeciesWithoutDiscovery('Ficus Lyrata', 'tree');

      expect(speciesInsert.insert).toHaveBeenCalledWith({
        canonical_name: 'ficus lyrata',
        plant_type: 'tree',
      });
      expect(result).toEqual({
        speciesId: 'species-new',
        displayName: 'Ficus Lyrata',
        totalDiscoverers: 0,
      });
      expect(supabase.from).not.toHaveBeenCalledWith('discovery_events');
      expect(supabase.rpc).not.toHaveBeenCalledWith('award_discovery_credits', expect.anything());
    });
  });
});
