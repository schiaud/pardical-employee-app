import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

// Shippo API configuration - key stored in Firebase Secrets
const shippoApiKey = defineSecret("SHIPPO_API_KEY");
const SHIPPO_API_BASE = "https://api.goshippo.com";

// Types
interface Address {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface Parcel {
  length: number;
  width: number;
  height: number;
  weight: number; // in ounces
}

interface RatesRequest {
  fromAddress: Address;
  toAddress: Address;
  parcel: Parcel;
}

interface ShippingRate {
  objectId: string;
  provider: string;
  servicelevelName: string;
  amount: string;
  currency: string;
  estimatedDays: number | null;
}

interface LabelRequest {
  rateId: string;
}

interface LabelResult {
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
}

/**
 * Get shipping rates from Shippo
 * Creates a shipment and returns available rates
 */
export const getShippingRates = onCall<RatesRequest>(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [shippoApiKey],
  },
  async (request): Promise<ShippingRate[]> => {
    const {fromAddress, toAddress, parcel} = request.data;

    // Validate input
    if (!fromAddress || !toAddress || !parcel) {
      throw new HttpsError(
        "invalid-argument",
        "fromAddress, toAddress, and parcel are required"
      );
    }

    logger.info("Creating Shippo shipment for rates", {
      from: `${fromAddress.city}, ${fromAddress.state}`,
      to: `${toAddress.city}, ${toAddress.state}`,
      weight: parcel.weight,
    });

    try {
      const response = await fetch(`${SHIPPO_API_BASE}/shipments`, {
        method: "POST",
        headers: {
          "Authorization": `ShippoToken ${shippoApiKey.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address_from: {
            name: fromAddress.name,
            street1: fromAddress.street1,
            street2: fromAddress.street2 || "",
            city: fromAddress.city,
            state: fromAddress.state,
            zip: fromAddress.zip,
            country: fromAddress.country,
          },
          address_to: {
            name: toAddress.name,
            street1: toAddress.street1,
            street2: toAddress.street2 || "",
            city: toAddress.city,
            state: toAddress.state,
            zip: toAddress.zip,
            country: toAddress.country,
          },
          parcels: [
            {
              length: String(parcel.length),
              width: String(parcel.width),
              height: String(parcel.height),
              distance_unit: "in",
              weight: String(parcel.weight),
              mass_unit: "oz",
            },
          ],
          async: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Shippo API error", {status: response.status, error: errorText});
        throw new HttpsError(
          "unavailable",
          `Shippo API error: ${response.status}`
        );
      }

      const data = await response.json();

      // Extract and format rates
      const rates: ShippingRate[] = (data.rates || []).map((rate: {
        object_id: string;
        provider: string;
        servicelevel: { name: string };
        amount: string;
        currency: string;
        estimated_days: number | null;
      }) => ({
        objectId: rate.object_id,
        provider: rate.provider,
        servicelevelName: rate.servicelevel?.name || "Standard",
        amount: rate.amount,
        currency: rate.currency,
        estimatedDays: rate.estimated_days,
      }));

      logger.info("Got shipping rates", {count: rates.length});

      return rates;
    } catch (error) {
      logger.error("Error getting shipping rates:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);

/**
 * Purchase a shipping label from Shippo
 * Takes a rate ID and returns the label URL and tracking number
 */
export const purchaseShippingLabel = onCall<LabelRequest>(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [shippoApiKey],
  },
  async (request): Promise<LabelResult> => {
    const {rateId} = request.data;

    if (!rateId) {
      throw new HttpsError(
        "invalid-argument",
        "rateId is required"
      );
    }

    logger.info("Purchasing shipping label", {rateId});

    try {
      const response = await fetch(`${SHIPPO_API_BASE}/transactions`, {
        method: "POST",
        headers: {
          "Authorization": `ShippoToken ${shippoApiKey.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rate: rateId,
          label_file_type: "PDF",
          async: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Shippo API error", {status: response.status, error: errorText});
        throw new HttpsError(
          "unavailable",
          `Shippo API error: ${response.status}`
        );
      }

      const data = await response.json();

      // Check transaction status
      if (data.status !== "SUCCESS") {
        logger.error("Transaction failed", {status: data.status, messages: data.messages});
        throw new HttpsError(
          "aborted",
          `Label purchase failed: ${data.messages?.join(", ") || "Unknown error"}`
        );
      }

      logger.info("Label purchased successfully", {
        tracking: data.tracking_number,
        carrier: data.rate?.provider,
      });

      return {
        trackingNumber: data.tracking_number,
        labelUrl: data.label_url,
        carrier: data.rate?.provider || "Unknown",
      };
    } catch (error) {
      logger.error("Error purchasing label:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);
