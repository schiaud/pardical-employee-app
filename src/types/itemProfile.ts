import { Timestamp } from 'firebase/firestore';

export interface ItemProfile {
  id: string;              // normalized item name (document ID)
  itemName: string;        // original display name
  itemId?: string;         // SKU if known
  notes: string;           // general notes
  ebayListingUrl: string;  // eBay listing link
  qualityNotes: string;    // known issues, inspection points
  vehicleFitment: string;  // year/make/model compatibility
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface ItemProfileFirestore {
  id: string;
  itemName: string;
  itemId?: string;
  notes: string;
  ebayListingUrl: string;
  qualityNotes: string;
  vehicleFitment: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}
