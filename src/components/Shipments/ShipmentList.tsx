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
import BlockIcon from '@mui/icons-material/Block';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getShipmentLabel, voidShippingLabel, Shipment } from '../../services/shippoShipping';

export const ShipmentList: React.FC = () => {
  const [shipments, setShipments] = useState<(Shipment & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

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

  const handleVoidLabel = async (shipment: Shipment & { id: string }) => {
    if (!confirm(`Void label for ${shipment.trackingNumber}?\n\nThis will request a refund from Shippo. The label will no longer be usable.`)) {
      return;
    }

    setVoidingId(shipment.id);
    try {
      const result = await voidShippingLabel(shipment.transactionId);

      // Update shipment in Firestore with refund info
      await updateDoc(doc(db, 'shipments', shipment.id), {
        refundId: result.refundId,
        refundStatus: result.status,
        refundedAt: new Date().toISOString(),
      });

      alert(`Refund ${result.status === 'SUCCESS' ? 'approved' : 'requested'}!\n\nStatus: ${result.status}\nRefund ID: ${result.refundId}`);
    } catch (error) {
      console.error('Error voiding label:', error);
      alert('Failed to void label. It may have already been used or the refund window has passed.');
    } finally {
      setVoidingId(null);
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

                {/* Price */}
                {shipment.price && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', mb: 0.25 }}>
                      Cost
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#22c55e', fontWeight: 500 }}>
                      ${shipment.price}
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

                {/* Refund Status */}
                {shipment.refundStatus && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', mb: 0.25 }}>
                      Refund
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color:
                          shipment.refundStatus === 'SUCCESS'
                            ? '#22c55e'
                            : shipment.refundStatus === 'ERROR'
                            ? '#ef4444'
                            : '#f59e0b',
                      }}
                    >
                      {shipment.refundStatus}
                    </Typography>
                  </Box>
                )}
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
                <Tooltip title={shipment.refundStatus ? `Refund ${shipment.refundStatus}` : 'Void label'}>
                  <span>
                    <IconButton
                      onClick={() => handleVoidLabel(shipment)}
                      disabled={voidingId === shipment.id || !!shipment.refundStatus}
                      sx={{
                        color: shipment.refundStatus ? '#71717a' : '#ef4444',
                        backgroundColor: shipment.refundStatus ? 'transparent' : 'rgba(239, 68, 68, 0.1)',
                        '&:hover': {
                          backgroundColor: shipment.refundStatus ? 'transparent' : 'rgba(239, 68, 68, 0.2)',
                        },
                        '&.Mui-disabled': {
                          color: '#52525b',
                        },
                      }}
                    >
                      {voidingId === shipment.id ? (
                        <CircularProgress size={20} sx={{ color: '#ef4444' }} />
                      ) : (
                        <BlockIcon />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};
