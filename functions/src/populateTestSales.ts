import * as admin from "firebase-admin";
import {onCall} from "firebase-functions/v2/https";

const db = admin.firestore();

// Normalize item name (same logic as in itemStats.ts)
const normalizeItemName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
};

/**
 * One-time callable to populate test sales data for a specific item
 */
export const populateTestSales = onCall(
  {cors: true},
  async (request) => {
    const itemName = request.data?.itemName ||
      "94-99 Toyota Celica GT ST ST204 AT200 OEM Gas Fuel Pump Sending Assembly";

    const normalizedId = normalizeItemName(itemName);

    console.log(`Populating sales for: ${itemName}`);
    console.log(`Normalized ID: ${normalizedId}`);

    // Generate 21 realistic sales over the past 2 years
    const sales = [
      // Recent sales (last few months)
      {date: "2024-12-23", price: 89.99, cost: 35.00, ship: 12.50},
      {date: "2024-11-15", price: 94.99, cost: 35.00, ship: 14.00},
      {date: "2024-10-28", price: 79.99, cost: 32.00, ship: 11.00},
      {date: "2024-09-12", price: 99.99, cost: 38.00, ship: 15.00},
      {date: "2024-08-05", price: 84.99, cost: 35.00, ship: 12.00},
      // Mid 2024
      {date: "2024-07-20", price: 89.99, cost: 36.00, ship: 13.00},
      {date: "2024-06-10", price: 74.99, cost: 30.00, ship: 10.00},
      {date: "2024-05-18", price: 92.50, cost: 35.00, ship: 14.00},
      {date: "2024-04-02", price: 87.00, cost: 34.00, ship: 12.50},
      {date: "2024-03-15", price: 95.00, cost: 37.00, ship: 13.50},
      // Early 2024
      {date: "2024-02-28", price: 82.99, cost: 33.00, ship: 11.00},
      {date: "2024-01-10", price: 89.99, cost: 35.00, ship: 12.00},
      // Late 2023
      {date: "2023-12-05", price: 99.99, cost: 40.00, ship: 15.00},
      {date: "2023-11-20", price: 79.99, cost: 32.00, ship: 10.50},
      {date: "2023-10-08", price: 84.50, cost: 34.00, ship: 11.50},
      {date: "2023-09-15", price: 91.00, cost: 36.00, ship: 13.00},
      {date: "2023-08-22", price: 77.99, cost: 30.00, ship: 10.00},
      // Mid 2023
      {date: "2023-07-10", price: 88.00, cost: 35.00, ship: 12.00},
      {date: "2023-06-05", price: 93.50, cost: 37.00, ship: 14.00},
      {date: "2023-05-18", price: 85.99, cost: 34.00, ship: 11.50},
      {date: "2023-04-02", price: 90.00, cost: 36.00, ship: 13.00},
    ];

    const itemStatsRef = db.collection("itemStats").doc(normalizedId);
    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;

    // Helper to get week and month keys
    const getWeekKey = (date: Date): string => {
      const year = date.getFullYear();
      const startOfYear = new Date(year, 0, 1);
      const days = Math.floor(
        (date.getTime() - startOfYear.getTime()) / 86400000
      );
      const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      return `${year}-W${week.toString().padStart(2, "0")}`;
    };

    const getMonthKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      return `${year}-${month}`;
    };

    const salesByWeek: Record<string, number> = {};
    const salesByMonth: Record<string, number> = {};

    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const saleDate = new Date(sale.date);
      const profit = sale.price - sale.cost - sale.ship;
      const margin = (profit / sale.price) * 100;

      totalRevenue += sale.price;
      totalCost += sale.cost + sale.ship;
      totalProfit += profit;

      const weekKey = getWeekKey(saleDate);
      const monthKey = getMonthKey(saleDate);
      salesByWeek[weekKey] = (salesByWeek[weekKey] || 0) + 1;
      salesByMonth[monthKey] = (salesByMonth[monthKey] || 0) + 1;

      const saleId = `test_sale_${i + 1}`;
      const saleRef = itemStatsRef.collection("sales").doc(saleId);

      batch.set(saleRef, {
        id: saleId,
        orderRef: `orders/test_order_${i + 1}`,
        orderNumber: `#TEST-${1000 + i}`,
        salePrice: sale.price,
        purchaseCost: sale.cost,
        shipCost: sale.ship,
        profit: Math.round(profit * 100) / 100,
        profitMargin: Math.round(margin * 10) / 10,
        saleDate: admin.firestore.Timestamp.fromDate(saleDate),
        createdAt: now,
      });
    }

    // Update the parent itemStats with aggregates
    const avgMargin = totalRevenue > 0 ?
      (totalProfit / totalRevenue) * 100 : 0;

    batch.update(itemStatsRef, {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      avgProfitMargin: Math.round(avgMargin * 10) / 10,
      salesByWeek,
      salesByMonth,
      updatedAt: now,
    });

    await batch.commit();

    return {
      success: true,
      itemId: normalizedId,
      salesCreated: sales.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      avgMargin: Math.round(avgMargin * 10) / 10,
    };
  }
);
