import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

admin.initializeApp();

// Item Stats functions
export {
  updateItemStatsOnOrder,
  calculateDailyStaleMetrics,
  migrateOrdersToItemStats,
  migrateAllOrdersToItemStats,
  weeklyPriceCheck,
  backfillSalesForItem,
  autoUnreviewStaleItems,
} from "./itemStats";

// Car-Part.com scraper functions
export {
  checkCarPartVariants,
  fetchCarPartPricing,
  updateItemPricing,
} from "./carPartScraper";

// eBay import functions
export {importEbayData} from "./ebayImport";

// Test data population (temporary)
export {populateTestSales} from "./populateTestSales";

/**
 * eBay Webhook Handler
 * Receives platform notifications from eBay when events occur
 *
 * URL will be: https://us-central1-pardical-web-app.cloudfunctions.net/ebayWebhook
 */
export const ebayWebhook = onRequest(
  {
    cors: true,
    maxInstances: 10,
  },
  async (req, res) => {
    // Log incoming request for debugging
    logger.info("eBay webhook received", {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });

    // Only accept POST requests
    if (req.method !== "POST") {
      logger.warn("Invalid method:", req.method);
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      // Get the notification data from eBay
      const notification = req.body;

      // Validate that we received data
      if (!notification) {
        logger.warn("No notification data received");
        res.status(400).json({error: "No notification data"});
        return;
      }

      // Store the notification in Firestore
      const docRef = await admin.firestore()
        .collection("ebayNotifications")
        .add({
          data: notification,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          processed: false,
        });

      logger.info("Notification stored successfully", {
        docId: docRef.id,
        notificationType: notification.notificationEventType || "unknown",
      });

      // Send success response to eBay
      res.status(200).json({
        success: true,
        message: "Notification received and stored",
        id: docRef.id,
      });
    } catch (error) {
      logger.error("Error processing eBay webhook:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Test endpoint to verify the function is working
 * URL: https://us-central1-pardical-web-app.cloudfunctions.net/testWebhook
 */
export const testWebhook = onRequest((req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Webhook endpoint is working!",
    timestamp: new Date().toISOString(),
  });
});
