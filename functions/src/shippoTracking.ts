import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

// Shippo API configuration - key stored in Firebase Secrets
const shippoApiKey = defineSecret("SHIPPO_API_KEY");
const BASE_URL = "https://api.goshippo.com/tracks";

// Carrier name normalization
const CARRIER_MAP: Record<string, string> = {
  "usps": "usps",
  "ups": "ups",
  "fedex": "fedex",
  "dhl": "dhl_express",
  "dhl express": "dhl_express",
  "dhl_express": "dhl_express",
  "ontrac": "ontrac",
  "lasership": "lasership",
  "amazon": "amazon_mws",
  "shippo": "shippo", // for testing
};

function normalizeCarrier(carrier: string): string {
  const normalized = carrier.toLowerCase().trim();
  return CARRIER_MAP[normalized] || normalized;
}

interface TrackingRequest {
  carrier: string;
  trackingNumber: string;
}

interface TrackingResult {
  status: string;
  statusDetails: string;
  eta: string | null;
  location?: {
    city: string;
    state: string;
  };
}

/**
 * Cloud Function to fetch tracking status from Shippo
 * Called from the frontend using Firebase callable functions
 */
export const getShippoTracking = onCall<TrackingRequest>(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [shippoApiKey],
  },
  async (request): Promise<TrackingResult> => {
    // Trim whitespace from inputs
    const carrier = request.data.carrier?.trim();
    const trackingNumber = request.data.trackingNumber?.trim();

    // Validate input
    if (!carrier || !trackingNumber) {
      throw new HttpsError(
        "invalid-argument",
        "Both carrier and trackingNumber are required"
      );
    }

    const normalizedCarrier = normalizeCarrier(carrier);
    const url = `${BASE_URL}/${normalizedCarrier}/${trackingNumber}`;

    logger.info("Fetching Shippo tracking", {
      carrier: normalizedCarrier,
      trackingNumber,
    });

    try {
      const response = await fetch(url, {
        headers: {
          "Authorization": `ShippoToken ${shippoApiKey.value()}`,
        },
      });

      if (!response.ok) {
        logger.error("Shippo API error", {status: response.status});
        throw new HttpsError(
          "unavailable",
          `Shippo API error: ${response.status}`
        );
      }

      const data = await response.json();

      logger.info("Shippo tracking result", {
        status: data.tracking_status?.status,
      });

      return {
        status: data.tracking_status?.status || "UNKNOWN",
        statusDetails: data.tracking_status?.status_details || "",
        eta: data.eta || null,
        location: data.tracking_status?.location ? {
          city: data.tracking_status.location.city || "",
          state: data.tracking_status.location.state || "",
        } : undefined,
      };
    } catch (error) {
      logger.error("Error fetching tracking:", error);
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
