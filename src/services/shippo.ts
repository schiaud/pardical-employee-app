/**
 * Shippo Tracking Service
 * Uses Firebase Cloud Function to fetch tracking (avoids CORS issues)
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app);
const getShippoTrackingFn = httpsCallable(functions, 'getShippoTracking');

export type TrackingStatus =
  | 'PRE_TRANSIT'
  | 'TRANSIT'
  | 'DELIVERED'
  | 'RETURNED'
  | 'FAILURE'
  | 'UNKNOWN';

export interface TrackingResult {
  status: TrackingStatus;
  statusDetails: string;
  eta: string | null;
  location?: {
    city: string;
    state: string;
  };
}

/**
 * Fetch tracking status via Cloud Function
 */
export async function getTrackingStatus(
  carrier: string,
  trackingNumber: string
): Promise<TrackingResult> {
  // console.log('Shippo: Fetching tracking via Cloud Function for', carrier, trackingNumber);

  try {
    const result = await getShippoTrackingFn({ carrier, trackingNumber });
    const data = result.data as TrackingResult;

    console.log('Shippo: Got response', data.status);
    return data;
  } catch (error) {
    // Don't log errors - they're expected for invalid tracking numbers with test API key
    throw error;
  }
}

/**
 * Check if cached tracking data is stale (older than TTL)
 * @param lastChecked ISO date string of last check
 * @param ttlHours Hours before data is considered stale (default: 2)
 */
export function isTrackingStale(lastChecked?: string, ttlHours = 2): boolean {
  if (!lastChecked) return true;

  const lastCheckedDate = new Date(lastChecked);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastCheckedDate.getTime()) / (1000 * 60 * 60);

  return hoursDiff > ttlHours;
}

/**
 * Check if we should fetch tracking (has tracking number, not delivered, stale cache)
 */
export function shouldFetchTracking(
  trackingNumber?: string,
  trackingStatus?: TrackingStatus,
  lastChecked?: string
): boolean {
  // No tracking number = nothing to fetch
  if (!trackingNumber) return false;

  // Already delivered = no need to fetch
  if (trackingStatus === 'DELIVERED') return false;

  // Check if cache is stale
  return isTrackingStale(lastChecked);
}
