import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const { getDiscoveryLocation } = require('../../services/discoveryService');

describe('discoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
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
  });
});
