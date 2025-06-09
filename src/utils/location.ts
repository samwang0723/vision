import { userLocations, userProfiles, userContacts, userEmails } from '../app';

export interface UserLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface UserProfile {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name: string;
  username: string;
  language_code: string;
  is_premium: boolean;
  full_name: string;
}

export interface UserContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

/**
 * Get user's stored location
 */
export function getUserLocation(userId: string): UserLocation | undefined {
  return userLocations.get(userId);
}

/**
 * Get user's profile information
 */
export function getUserProfile(userId: string): UserProfile | undefined {
  return userProfiles.get(userId);
}

/**
 * Get user's contact information
 */
export function getUserContact(userId: string): UserContact | undefined {
  return userContacts.get(userId);
}

/**
 * Get user's email address
 */
export function getUserEmail(userId: string): string | undefined {
  return userEmails.get(userId);
}

/**
 * Store user location
 */
export function setUserLocation(userId: string, location: UserLocation): void {
  userLocations.set(userId, location);
}

/**
 * Store user contact
 */
export function setUserContact(userId: string, contact: UserContact): void {
  userContacts.set(userId, contact);
}

/**
 * Store user email
 */
export function setUserEmail(userId: string, email: string): void {
  userEmails.set(userId, email);
}

/**
 * Check if user has location stored
 */
export function hasUserLocation(userId: string): boolean {
  return userLocations.has(userId);
}

/**
 * Check if user has profile stored
 */
export function hasUserProfile(userId: string): boolean {
  return userProfiles.has(userId);
}

/**
 * Check if user has contact stored
 */
export function hasUserContact(userId: string): boolean {
  return userContacts.has(userId);
}

/**
 * Check if user has email stored
 */
export function hasUserEmail(userId: string): boolean {
  return userEmails.has(userId);
}

/**
 * Remove user location
 */
export function removeUserLocation(userId: string): boolean {
  return userLocations.delete(userId);
}

/**
 * Remove user contact
 */
export function removeUserContact(userId: string): boolean {
  return userContacts.delete(userId);
}

/**
 * Remove user email
 */
export function removeUserEmail(userId: string): boolean {
  return userEmails.delete(userId);
}

/**
 * Get all users with stored locations
 */
export function getUsersWithLocations(): string[] {
  return Array.from(userLocations.keys());
}

/**
 * Get all users with stored profiles
 */
export function getUsersWithProfiles(): string[] {
  return Array.from(userProfiles.keys());
}

/**
 * Get all users with stored contacts
 */
export function getUsersWithContacts(): string[] {
  return Array.from(userContacts.keys());
}

/**
 * Get all users with stored emails
 */
export function getUsersWithEmails(): string[] {
  return Array.from(userEmails.keys());
}

/**
 * Get complete user information
 */
export function getCompleteUserInfo(userId: string) {
  return {
    profile: getUserProfile(userId),
    location: getUserLocation(userId),
    contact: getUserContact(userId),
    email: getUserEmail(userId),
  };
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
