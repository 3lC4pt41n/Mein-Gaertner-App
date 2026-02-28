import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Lightweight hook that tracks network connectivity.
 * Returns { isConnected, isInternetReachable }.
 *
 * - isConnected: device has network interface (WiFi/Cellular)
 * - isInternetReachable: actual internet connectivity confirmed
 */
export default function useNetworkStatus() {
  const [status, setStatus] = useState({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setStatus({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable ?? true,
      });
    });

    return () => unsubscribe();
  }, []);

  return status;
}
