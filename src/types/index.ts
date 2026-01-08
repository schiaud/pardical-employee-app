export type OrderStatus = 
  | 'not shipped' 
  | 'notShipped'
  | 'processing' 
  | 'shipped' 
  | 'delivered' 
  | 'completed'
  | 'return' 
  | 'return done'
  | 'return complete';

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  item: string;
  itemId?: string;
  quantity: number;
  earnings: string;
  
  // Customer Information
  buyerUsername: string;
  buyerEmail?: string;
  shipName?: string;
  shipRef?: string;
  shipAddress?: string;
  shipAddress2?: string;
  shipCity?: string;
  shipState?: string;
  shipZip?: string;
  shipCountry?: string;
  shipPhone?: string;
  
  // Dates
  paidDate: string;
  dueDate?: string;
  time?: string | Date;
  updatedAt?: string;
  
  // Tracking Information
  tracking?: string;
  carrier?: string;
  
  // Supplier Information
  supplier?: string;
  supplierContact?: string;
  supplierPhone?: string;
  
  // Financial Information
  buyPrice?: string;
  shipPrice?: string;
  
  // Employee Assignment
  employee?: string;
  
  // Notes
  notes?: string;

  // Internal tracking (not stored in Firestore)
  _collection?: 'orders' | 'returns';
}

export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface EmployeeReport {
  employee: string;
  orderCount: number;
}

export interface ItemReport {
  item: string;
  totalSold: number;
}

export interface Customer {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  isAmazonCustomer: boolean;
  supplier?: string;
  orderCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
}

// Re-export stale items types
export * from './staleItems';