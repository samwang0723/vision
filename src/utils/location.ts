import { userLocations } from '../app';

export interface UserLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

/**
 * Get user's stored location
 */
export function getUserLocation(userId: string): UserLocation | undefined {
  return userLocations.get(userId);
}

/**
 * Store user location
 */
export function setUserLocation(userId: string, location: UserLocation): void {
  userLocations.set(userId, location);
}

/**
 * Check if user has location stored
 */
export function hasUserLocation(userId: string): boolean {
  return userLocations.has(userId);
}

/**
 * Remove user location
 */
export function removeUserLocation(userId: string): boolean {
  return userLocations.delete(userId);
}

/**
 * Get all users with stored locations
 */
export function getUsersWithLocations(): string[] {
  return Array.from(userLocations.keys());
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Format location for display
 */
export function formatLocation(location: UserLocation): string {
  let formatted = `📍 Lat: ${location.latitude.toFixed(
    6
  )}, Lng: ${location.longitude.toFixed(6)}`;
  if (location.address) {
    formatted += `\n📍 Address: ${location.address}`;
  }
  return formatted;
}
