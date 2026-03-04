import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// Import after mocks are set up via jest.setup.js
const {
  requestLocationPermission,
  getCurrentWeather,
  getWeatherForecast,
  getWeatherForTasks,
} = require('../../services/weatherService');

describe('weatherService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  describe('requestLocationPermission', () => {
    it('returns { denied: true } when permission is not granted', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await requestLocationPermission();
      expect(result).toEqual({ denied: true });
    });

    it('returns coordinates when permission is granted', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 52.52, longitude: 13.405 },
      });

      const result = await requestLocationPermission();
      expect(result).toEqual({ latitude: 52.52, longitude: 13.405 });
    });
  });

  describe('getCurrentWeather – denied permission', () => {
    it('returns { denied: true } when location is denied (no cache)', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await getCurrentWeather();
      expect(result).toEqual({ denied: true });
    });

    it('does not call the weather API when location is denied', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
      global.fetch = jest.fn();

      await getCurrentWeather();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getWeatherForecast – denied permission', () => {
    it('returns { denied: true } when location is denied (no cache)', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await getWeatherForecast();
      expect(result).toEqual({ denied: true });
    });

    it('does not call the forecast API when location is denied', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
      global.fetch = jest.fn();

      await getWeatherForecast();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getWeatherForTasks – denied permission', () => {
    it('returns { denied: true } when location is denied', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await getWeatherForTasks();
      expect(result).toEqual({ denied: true });
    });
  });
});
