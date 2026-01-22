import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getShipmentLabel, Shipment } from '../../services/shippoShipping';

export const ShipmentList: React.FC = () => {
  const [shipments, setShipments] = useState<(Shipment & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printingId, setPrintingId] = useState<string | null>(null);

  useEffect(() => {
    const shipmentsRef = collection(db, 'shipments');
    const shipmentsQuery = query(
      shipmentsRef,
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(shipmentsQuery, (snapshot) => {
      const shipmentData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (Shipment & { id: string })[];
      setShipments(shipmentData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handlePrintLabel = async (shipment: Shipment & { id: string }) => {
    setPrintingId(shipment.id);
    try {
      const result = await getShipmentLabel(shipment.transactionId);
      window.open(result.labelUrl, '_blank');
    } catch (error) {
      console.error('Error retrieving label:', error);
      alert('Failed to retrieve label. Please try again.');
    } finally {
      setPrintingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <LocalShippingIcon sx={{ color: '#3b82f6', fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#fff' }}>
          Recent Shipments
        </Typography>
        <Typography sx={{ color: '#71717a', fontSize: '14px' }}>
          Last 20 labels purchased
        </Typography>
      </Box>

      {shipments.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center', border: '1px solid #27272a' }}>
          <Typography sx={{ color: '#71717a' }}>
            No shipments yet. Purchase a label to see it here.
          </Typography>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {shipments.map((shipment) => (
            <Card
              key={shipment.id}
              sx={{
                p: 2,
                border: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                '&:hover': {
                  borderColor: '#3f3f46',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
                {/* Route: From > To */}
                <Box sx={{ minWidth: 280 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: '14px' }}>
                      {shipment.fromName}
                    </Typography>
                    <Typography sx={{ color: '#52525b', fontSize: '14px' }}>
                      ({shipment.fromCity}, {shipment.fromState})
                    </Typography>
                    <Typography sx={{ color: '#3b82f6', mx: 1 }}>→</Typography>
                    <Typography sx={{ color: '#fff', fontWeight: 500, fontSize: '14px' }}>
                      {shipment.toName}
                    </Typography>
                    <Typography sx={{ color: '#52525b', fontSize: '14px' }}>
                      ({shipment.toCity}, {shipment.toState})
                    </Typography>
                  </Box>
                </Box>

                {/* Carrier & Tracking */}
                <Box sx={{ minWidth: 200 }}>
                  <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', mb: 0.25 }}>
                    {shipment.carrier}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '13px',
                      color: '#a1a1aa',
                      fontFamily: 'monospace',
                    }}
                  >
                    {shipment.trackingNumber}
                  </Typography>
                </Box>

                {/* Order Number */}
                {shipment.orderNumber && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', mb: 0.25 }}>
                      Order
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#3b82f6', fontWeight: 500 }}>
                      #{shipment.orderNumber}
                    </Typography>
                  </Box>
                )}

                {/* Date */}
                <Box>
                  <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', mb: 0.25 }}>
                    Created
                  </Typography>
                  <Typography sx={{ fontSize: '13px', color: '#a1a1aa' }}>
                    {formatDate(shipment.createdAt)}
                  </Typography>
                </Box>

                {/* Created By */}
                <Box>
                  <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', mb: 0.25 }}>
                    By
                  </Typography>
                  <Typography sx={{ fontSize: '13px', color: '#22c55e' }}>
                    {shipment.createdBy}
                  </Typography>
                </Box>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Print label">
                  <IconButton
                    onClick={() => handlePrintLabel(shipment)}
                    disabled={printingId === shipment.id}
                    sx={{
                      color: '#3b82f6',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      '&:hover': {
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                      },
                    }}
                  >
                    {printingId === shipment.id ? (
                      <CircularProgress size={20} sx={{ color: '#3b82f6' }} />
                    ) : (
                      <PrintIcon />
                    )}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Track package">
                  <IconButton
                    onClick={() => {
                      const carrierUrls: Record<string, string> = {
                        'USPS': `https://tools.usps.com/go/TrackConfirmAction?tLabels=${shipment.trackingNumber}`,
                        'UPS': `https://www.ups.com/track?tracknum=${shipment.trackingNumber}`,
                        'FedEx': `https://www.fedex.com/fedextrack/?trknbr=${shipment.trackingNumber}`,
                      };
                      const url = carrierUrls[shipment.carrier] ||
                        `https://www.google.com/search?q=${shipment.carrier}+tracking+${shipment.trackingNumber}`;
                      window.open(url, '_blank');
                    }}
                    sx={{
                      color: '#a1a1aa',
                      '&:hover': {
                        backgroundColor: 'rgba(161, 161, 170, 0.1)',
                      },
                    }}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};
