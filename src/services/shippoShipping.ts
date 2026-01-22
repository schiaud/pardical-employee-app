/**
 * Shippo Shipping Service
 * Uses Firebase Cloud Functions to get rates and purchase labels
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app);
const getShippingRatesFn = httpsCallable(functions, 'getShippingRates');
const purchaseShippingLabelFn = httpsCallable(functions, 'purchaseShippingLabel');
const scheduleUSPSPickupFn = httpsCallable(functions, 'scheduleUSPSPickup');

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
  transactionId: string;
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
}

export interface PickupResult {
  confirmationNumber: string;
  pickupDate: string;
}

export interface Shipment {
  id?: string;
  transactionId: string;
  trackingNumber: string;
  carrier: string;
  labelUrl: string;
  fromName: string;
  fromCity: string;
  fromState: string;
  toName: string;
  toCity: string;
  toState: string;
  orderId?: string;
  orderNumber?: string;
  createdAt: string;
  createdBy: string;
  price?: string;
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

/**
 * Schedule a free USPS pickup
 */
export async function scheduleUSPSPickup(
  transactionId: string,
  pickupAddress: Address,
  buildingLocationType: string,
  instructions?: string
): Promise<PickupResult> {
  const result = await scheduleUSPSPickupFn({
    transactionId,
    pickupAddress,
    buildingLocationType,
    instructions,
  });
  return result.data as PickupResult;
}

const getShipmentLabelFn = httpsCallable(functions, 'getShipmentLabel');

/**
 * Get a fresh label URL from a transaction ID
 * Used for label recovery when original URL expires
 */
export async function getShipmentLabel(transactionId: string): Promise<{ labelUrl: string; trackingNumber: string }> {
  const result = await getShipmentLabelFn({ transactionId });
  return result.data as { labelUrl: string; trackingNumber: string };
}
