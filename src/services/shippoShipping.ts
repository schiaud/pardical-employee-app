/**
 * Shippo Shipping Service
 * Uses Firebase Cloud Functions to get rates and purchase labels
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app);
const getShippingRatesFn = httpsCallable(functions, 'getShippingRates');
const purchaseShippingLabelFn = httpsCallable(functions, 'purchaseShippingLabel');

// Types
export interface Address {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Parcel {
  length: number;
  width: number;
  height: number;
  weight: number; // in ounces
}

export interface ShippingRate {
  objectId: string;
  provider: string;
  servicelevelName: string;
  amount: string;
  currency: string;
  estimatedDays: number | null;
}

export interface LabelResult {
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
}

/**
 * Get shipping rates from Shippo
 */
export async function getShippingRates(
  fromAddress: Address,
  toAddress: Address,
  parcel: Parcel
): Promise<ShippingRate[]> {
  const result = await getShippingRatesFn({ fromAddress, toAddress, parcel });
  return result.data as ShippingRate[];
}

/**
 * Purchase a shipping label
 */
export async function purchaseShippingLabel(rateId: string): Promise<LabelResult> {
  const result = await purchaseShippingLabelFn({ rateId });
  return result.data as LabelResult;
}
