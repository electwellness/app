import { Linking, Platform } from 'react-native';

/**
 * Opens the given address in Google Maps.
 * Works on web, iOS, and Android.
 */
export function openAddressInMaps(address: string): void {
  const encoded = encodeURIComponent(address);

  // Universal Google Maps URL that works on all platforms
  const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  Linking.openURL(url).catch((err) => {
    console.warn('Failed to open Google Maps:', err);
  });
}

/**
 * Opens Google Maps directions from an origin address to a destination address.
 * Works on web, iOS, and Android.
 */
export function openDirectionsInMaps(origin: string, destination: string): void {
  const encodedOrigin = encodeURIComponent(origin);
  const encodedDest = encodeURIComponent(destination);

  // Google Maps directions URL — works universally
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDest}&travelmode=driving`;

  Linking.openURL(url).catch((err) => {
    console.warn('Failed to open Google Maps directions:', err);
  });
}
