import React, { useState, useEffect } from 'react';
import {
  Card,
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  IconButton,
  Collapse,
  CircularProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ItemProfileDialog } from './ItemProfileDialog';
import { ClickableItemTitle } from './ClickableItemTitle';
import { Order, OrderStatus } from '../../types';
import { TrackingProgressBar } from './TrackingProgressBar';
import { getTrackingStatus, shouldFetchTracking, type TrackingStatus } from '../../services/shippo';

interface ReturnTicketCardProps {
  order: Order;
}

const getReturnStatusColor = (status: string): string => {
  if (status === 'return') return '#a855f7'; // purple - in progress
  if (status === 'return delivered') return '#f97316'; // orange - shipped back
  if (status === 'refunded') return '#22c55e'; // green - money back
  return '#71717a'; // grey
};

const getReturnStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'return': 'RETURN',
    'return delivered': 'RETURN DELIVERED',
    'refunded': 'REFUNDED',
  };
  return labels[status] || status.toUpperCase();
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-CA');
  } catch {
    return dateString;
  }
};

const formatCurrency = (value?: string): string => {
  if (!value) return '';
  const num = parseFloat(value.replace(/[^\d.-]/g, ''));
  return isNaN(num) ? value : num.toFixed(2);
};

export const ReturnTicketCard: React.FC<ReturnTicketCardProps> = ({ order }) => {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemProfileOpen, setItemProfileOpen] = useState(false);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [returnTrackingStatus, setReturnTrackingStatus] = useState<TrackingStatus | undefined>(order.returnTrackingStatus);
  const [returnTrackingStatusDetails, setReturnTrackingStatusDetails] = useState(order.returnTrackingStatusDetails);
  const [returnTrackingEta, setReturnTrackingEta] = useState(order.returnTrackingEta);
  const [returnTrackingLastChecked, setReturnTrackingLastChecked] = useState(order.returnTrackingLastChecked);

  // Editable fields state
  const [returnTracking, setReturnTracking] = useState(order.returnTracking || '');
  const [returnCarrier, setReturnCarrier] = useState(order.returnCarrier || '');
  const [credited, setCredited] = useState(order.credited || '');
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [notes, setNotes] = useState(order.notes || '');

  // Fetch return tracking status from Shippo and cache in Firestore
  const fetchReturnTrackingStatus = async (force = false) => {
    // Check if we should fetch (has tracking, not delivered, stale cache)
    if (!force && !shouldFetchTracking(order.returnTracking, returnTrackingStatus, returnTrackingLastChecked)) {
      return;
    }
    if (!order.returnTracking || !order.returnCarrier) return;

    setIsTrackingLoading(true);
    try {
      const result = await getTrackingStatus(order.returnCarrier, order.returnTracking);
      const now = new Date().toISOString();

      // Update local state
      setReturnTrackingStatus(result.status);
      setReturnTrackingStatusDetails(result.statusDetails);
      setReturnTrackingEta(result.eta || undefined);
      setReturnTrackingLastChecked(now);

      // Save to Firestore
      const orderRef = doc(db, 'returns', order.id);
      await updateDoc(orderRef, {
        returnTrackingStatus: result.status,
        returnTrackingStatusDetails: result.statusDetails,
        returnTrackingEta: result.eta || null,
        returnTrackingLastChecked: now,
      });
    } catch (error) {
      // Silently fail - tracking fetch errors are expected for invalid/test data
      // console.error('Error fetching return tracking:', error);
    } finally {
      setIsTrackingLoading(false);
    }
  };

  // Auto-fetch return tracking on mount if stale
  useEffect(() => {
    if (order.returnTracking && order.returnCarrier) {
      fetchReturnTrackingStatus();
    }
  }, [order.id]);

  const statusColor = getReturnStatusColor(order.status);
  const employeeDisplay = order.employee?.replace('@pardical.com', '') || 'n/a';

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const orderRef = doc(db, 'returns', order.id);
      await updateDoc(orderRef, {
        returnTracking,
        returnCarrier,
        credited,
        status,
        notes,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error updating return:', error);
      alert('Failed to update return. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this return ticket?')) {
      return;
    }
    setIsDeleting(true);
    try {
      const orderRef = doc(db, 'returns', order.id);
      await deleteDoc(orderRef);
    } catch (error) {
      console.error('Error deleting return:', error);
      alert('Failed to delete return. Please try again.');
      setIsDeleting(false);
    }
  };

  const notesPreview = notes.length > 80 ? notes.substring(0, 80) + '...' : notes;

  return (
    <Card sx={{ mb: 1.5, border: '1px solid #27272a', overflow: 'hidden' }}>
      {/* Header Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.25,
          backgroundColor: '#1a1520', // slightly purple tint for returns
          borderBottom: '1px solid #27272a',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: '4px',
              backgroundColor: statusColor,
              color: '#fff',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {getReturnStatusLabel(order.status)}
          </Box>
          <Typography
            sx={{
              color: '#a855f7',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            #{order.orderNumber}
          </Typography>
          <ClickableItemTitle
            itemName={order.item}
            onOpenProfile={() => setItemProfileOpen(true)}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            sx={{
              color: '#a855f7',
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              px: 1,
              py: 0.5,
              borderRadius: '4px',
            }}
          >
            {employeeDisplay}
          </Typography>
        </Box>
      </Box>

      {/* Body - Two Sections */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', borderBottom: '1px solid #27272a' }}>
        {/* Left: Original Order Info (Read-only) */}
        <Box sx={{ p: 2, borderRight: '1px solid #27272a' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#a855f7', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#52525b' }}>
              Original Order Info
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 2 }}>
            {/* Customer */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Customer</Typography>
              <Typography sx={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>{order.shipName || order.buyerUsername}</Typography>
              <Typography sx={{ fontSize: '11px', color: '#71717a' }}>Buyer ID: {order.buyerUsername}</Typography>
              {order.shipAddress && <Typography sx={{ fontSize: '11px', color: '#71717a' }}>{order.shipAddress}</Typography>}
              {order.shipAddress2 && <Typography sx={{ fontSize: '11px', color: '#71717a' }}>{order.shipAddress2}</Typography>}
              <Typography sx={{ fontSize: '11px', color: '#71717a' }}>
                {[order.shipCity, order.shipState, order.shipZip].filter(Boolean).join(', ')}
              </Typography>
              {order.shipPhone && <Typography sx={{ fontSize: '11px', color: '#71717a' }}>{order.shipPhone}</Typography>}
            </Box>

            {/* Quantity */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Quantity</Typography>
              <Typography sx={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>{order.quantity}</Typography>
            </Box>

            {/* Original Sold For */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Sold For</Typography>
              <Typography sx={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>${formatCurrency(order.earnings)}</Typography>
            </Box>

            {/* Date Sold */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Date Sold</Typography>
              <Typography sx={{ fontSize: '12px', color: '#e4e4e7' }}>{formatDate(order.paidDate)}</Typography>
            </Box>
          </Box>

          {/* Original supplier info */}
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #27272a' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Orig. Supplier</Typography>
                <Typography sx={{ fontSize: '11px', color: '#a1a1aa' }}>{order.supplier || '—'}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Contact</Typography>
                <Typography sx={{ fontSize: '11px', color: '#a1a1aa' }}>{order.supplierContact || '—'}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Phone</Typography>
                <Typography sx={{ fontSize: '11px', color: '#a1a1aa' }}>{order.supplierPhone || '—'}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Buy Price</Typography>
                <Typography sx={{ fontSize: '11px', color: '#a1a1aa' }}>{order.buyPrice ? `$${formatCurrency(order.buyPrice)}` : '—'}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Ship Price</Typography>
                <Typography sx={{ fontSize: '11px', color: '#a1a1aa' }}>{order.shipPrice ? `$${formatCurrency(order.shipPrice)}` : '—'}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Orig. Tracking</Typography>
                <Typography sx={{ fontSize: '11px', color: '#a1a1aa' }}>{order.tracking || '—'}</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Right: Return Details (Editable) */}
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#f97316', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#52525b' }}>
              Return Details (Editable)
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1.5, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Return Tracking</Typography>
              <TextField
                size="small"
                value={returnTracking}
                onChange={(e) => setReturnTracking(e.target.value)}
                placeholder="Tracking # for return shipment"
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Return Carrier</Typography>
              <TextField
                size="small"
                value={returnCarrier}
                onChange={(e) => setReturnCarrier(e.target.value)}
                placeholder="UPS, FedEx, etc."
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Credited Amount</Typography>
              <TextField
                size="small"
                value={credited}
                onChange={(e) => setCredited(e.target.value)}
                placeholder="$ amount refunded by supplier"
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Footer - Notes & Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, backgroundColor: '#0f0f10' }}>
        <Box sx={{ flex: 1, mr: 2 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
            onClick={() => setNotesExpanded(!notesExpanded)}
          >
            <IconButton
              size="small"
              sx={{
                p: 0.25,
                color: '#a1a1aa',
                transform: notesExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography sx={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 500 }}>Notes</Typography>
            {!notesExpanded && notes && (
              <Typography sx={{ fontSize: '11px', color: '#52525b', ml: 1 }}>
                {notesPreview}
              </Typography>
            )}
          </Box>
          <Collapse in={notesExpanded}>
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              sx={{
                mt: 1.5,
                '& .MuiInputBase-input': { fontSize: '12px' },
                '& .MuiOutlinedInput-root': { backgroundColor: '#18181b' },
              }}
            />
          </Collapse>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Return Tracking Progress - inline in footer */}
          {order.returnTracking && (
            <>
              <TrackingProgressBar
                status={returnTrackingStatus}
                eta={returnTrackingEta}
                isLoading={isTrackingLoading}
                onRefresh={() => fetchReturnTrackingStatus(true)}
              />
              <Box sx={{ width: '1px', height: 24, backgroundColor: '#52525b', mx: 1.5 }} />
            </>
          )}

          {order.updatedAt && (
            <Typography sx={{ fontSize: '10px', color: '#52525b', mr: 1 }}>
              Updated: {new Date(order.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Typography>
          )}
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={handleDelete}
            disabled={isDeleting}
            sx={{ fontSize: '11px', fontWeight: 600, minWidth: 70 }}
          >
            {isDeleting ? <CircularProgress size={16} /> : 'DELETE'}
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleUpdate}
            disabled={isUpdating}
            sx={{ fontSize: '11px', fontWeight: 600, minWidth: 70 }}
          >
            {isUpdating ? <CircularProgress size={16} /> : 'UPDATE'}
          </Button>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
            size="small"
            sx={{
              fontSize: '11px',
              fontWeight: 600,
              minWidth: 160,
              backgroundColor: '#52525b',
              color: '#fff',
              '& .MuiSelect-select': { py: 0.75 },
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            }}
          >
            <MenuItem value="return">RETURN</MenuItem>
            <MenuItem value="return delivered">RETURN DELIVERED</MenuItem>
            <MenuItem value="refunded">REFUNDED</MenuItem>
          </Select>
        </Box>
      </Box>

      <ItemProfileDialog
        open={itemProfileOpen}
        onClose={() => setItemProfileOpen(false)}
        itemName={order.item}
        itemId={order.itemId}
      />
    </Card>
  );
};
