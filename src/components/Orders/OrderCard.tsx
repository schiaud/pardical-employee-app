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
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneIcon from '@mui/icons-material/Phone';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import { doc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../Auth/AuthContext';
import { CreateOrderDialog } from './CreateOrderDialog';
import { ReplacementDialog } from './ReplacementDialog';
import { ItemProfileDialog } from './ItemProfileDialog';
import { ClickableItemTitle } from './ClickableItemTitle';
import { Order, OrderStatus } from '../../types';
import { TrackingProgressBar } from './TrackingProgressBar';
import { getTrackingStatus, shouldFetchTracking, type TrackingStatus } from '../../services/shippo';

interface OrderCardProps {
  order: Order;
}

const getStatusColor = (status: string, dueDate?: string): string => {
  if (status === 'notShipped' || status === 'not shipped') {
    if (dueDate && new Date(dueDate) < new Date()) {
      return '#ef4444'; // red - overdue
    }
    return '#f97316'; // orange
  }
  if (status === 'processing') {
    return '#eab308'; // yellow
  }
  if (status === 'shipped' || status === 'completed' || status === 'delivered') {
    return '#22c55e'; // green
  }
  if (status === 'return' || status === 'return done' || status === 'return complete') {
    return '#a855f7'; // purple
  }
  if (status === 'return delivered') {
    return '#f97316'; // orange - shipped back to supplier
  }
  if (status === 'refunded') {
    return '#22c55e'; // green - money back
  }
  return '#71717a'; // grey
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'not shipped': 'NOT SHIPPED',
    'notShipped': 'NOT SHIPPED',
    'processing': 'PROCESSING',
    'shipped': 'SHIPPED',
    'delivered': 'DELIVERED',
    'completed': 'COMPLETED',
    'return': 'RETURN',
    'return done': 'RETURN DONE',
    'return complete': 'RETURN COMPLETE',
    'return delivered': 'RETURN DELIVERED',
    'refunded': 'REFUNDED',
  };
  return labels[status] || status.toUpperCase();
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-CA'); // YYYY-MM-DD format
  } catch {
    return dateString;
  }
};

const formatCurrency = (value?: string): string => {
  if (!value) return '';
  const num = parseFloat(value.replace(/[^\d.-]/g, ''));
  return isNaN(num) ? value : num.toFixed(2);
};

// Helper to check if order is unassigned
const isUnassigned = (employee?: string): boolean => {
  return !employee || employee.trim() === '' || employee.trim().toLowerCase() === 'n/a';
};

export const OrderCard: React.FC<OrderCardProps> = ({ order }) => {
  const { user } = useAuth();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false);
  const [itemProfileOpen, setItemProfileOpen] = useState(false);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus | undefined>(order.trackingStatus);
  const [trackingStatusDetails, setTrackingStatusDetails] = useState(order.trackingStatusDetails);
  const [trackingEta, setTrackingEta] = useState(order.trackingEta);
  const [trackingLastChecked, setTrackingLastChecked] = useState(order.trackingLastChecked);

  // Editable fields state
  const [tracking, setTracking] = useState(order.tracking || '');
  const [carrier, setCarrier] = useState(order.carrier || '');
  const [supplier, setSupplier] = useState(order.supplier || '');
  const [supplierContact, setSupplierContact] = useState(order.supplierContact || '');
  const [supplierPhone, setSupplierPhone] = useState(order.supplierPhone || '');
  const [buyPrice, setBuyPrice] = useState(order.buyPrice || '');
  const [shipPrice, setShipPrice] = useState(order.shipPrice || '');
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [notes, setNotes] = useState(order.notes || '');

  // Fetch tracking status from Shippo and cache in Firestore
  const fetchTrackingStatus = async (force = false) => {
    // Check if we should fetch (has tracking, not delivered, stale cache)
    if (!force && !shouldFetchTracking(order.tracking, trackingStatus, trackingLastChecked)) {
      return;
    }
    if (!order.tracking || !order.carrier) return;

    setIsTrackingLoading(true);
    try {
      const result = await getTrackingStatus(order.carrier, order.tracking);
      const now = new Date().toISOString();

      // Update local state
      setTrackingStatus(result.status);
      setTrackingStatusDetails(result.statusDetails);
      setTrackingEta(result.eta || undefined);
      setTrackingLastChecked(now);

      // Save to Firestore
      const collectionName = order._collection || 'orders';
      const orderRef = doc(db, collectionName, order.id);
      await updateDoc(orderRef, {
        trackingStatus: result.status,
        trackingStatusDetails: result.statusDetails,
        trackingEta: result.eta || null,
        trackingLastChecked: now,
      });
    } catch (error) {
      // Silently fail - tracking fetch errors are expected for invalid/test data
      // console.error('Error fetching tracking:', error);
    } finally {
      setIsTrackingLoading(false);
    }
  };

  // Auto-fetch tracking on mount if stale
  useEffect(() => {
    if (order.tracking && order.carrier) {
      fetchTrackingStatus();
    }
  }, [order.id]); // Only run on mount or when order changes

  const statusColor = getStatusColor(order.status, order.dueDate);
  const unassigned = isUnassigned(order.employee);
  const employeeDisplay = unassigned
    ? 'n/a'
    : order.employee!.replace('@pardical.com', '');

  const handleClaimTicket = async () => {
    if (!user?.displayName) {
      alert('Unable to claim ticket: User name not available');
      return;
    }
    setIsClaiming(true);
    try {
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        employee: user.displayName,
      });
    } catch (error) {
      console.error('Error claiming ticket:', error);
      alert('Failed to claim ticket. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  const performUpdate = async () => {
    setIsUpdating(true);
    try {
      const collectionName = order._collection || 'orders';
      const orderRef = doc(db, collectionName, order.id);
      await updateDoc(orderRef, {
        tracking,
        carrier,
        supplier,
        supplierContact,
        supplierPhone,
        buyPrice,
        shipPrice,
        status,
        notes,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdate = async () => {
    // Check if status is changing TO 'return' from something else
    if (status === 'return' && order.status !== 'return') {
      setReplacementDialogOpen(true);
      return;
    }
    await performUpdate();
  };

  const handleReplacementConfirm = async (wantsReplacement: boolean) => {
    setReplacementDialogOpen(false);

    if (!wantsReplacement) {
      // Create return ticket in returns collection (no replacement needed)
      setIsUpdating(true);
      try {
        const returnData = {
          ...order,
          tracking,
          carrier,
          supplier,
          supplierContact,
          supplierPhone,
          buyPrice,
          shipPrice,
          status: 'return' as OrderStatus,
          notes,
          returnedAt: new Date().toISOString(),
          originalOrderId: order.id,
        };
        const { id, ...returnDataWithoutId } = returnData;
        await addDoc(collection(db, 'returns'), returnDataWithoutId);

        // Mark original order as 'return done' so it doesn't show in orders list
        const orderRef = doc(db, 'orders', order.id);
        await updateDoc(orderRef, {
          status: 'return done',
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error creating return ticket:', error);
        alert('Failed to create return ticket. Please try again.');
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    // Customer wants replacement - do the full workflow
    setIsUpdating(true);
    try {
      // 1. Copy FULL order to 'returns' collection with current edits
      const returnData = {
        ...order,
        tracking,
        carrier,
        supplier,
        supplierContact,
        supplierPhone,
        buyPrice,
        shipPrice,
        status: 'return' as OrderStatus,
        notes,
        returnedAt: new Date().toISOString(),
        originalOrderId: order.id,
      };
      // Remove id field - Firestore will generate a new one
      const { id, ...returnDataWithoutId } = returnData;
      await addDoc(collection(db, 'returns'), returnDataWithoutId);

      // 2. Reset original order to clean state for replacement
      const orderRef = doc(db, 'orders', order.id);
      const newNotes = `Replacement\n\nOld------\n${notes}`;
      await updateDoc(orderRef, {
        // Clear fulfillment fields
        tracking: '',
        carrier: '',
        supplier: '',
        supplierContact: '',
        supplierPhone: '',
        buyPrice: '',
        shipPrice: '',
        // Keep employee assigned
        // Reset status
        status: 'not shipped',
        // Format notes
        notes: newNotes,
        updatedAt: new Date().toISOString(),
      });

      // 3. Update local state to reflect changes
      setTracking('');
      setCarrier('');
      setSupplier('');
      setSupplierContact('');
      setSupplierPhone('');
      setBuyPrice('');
      setShipPrice('');
      setStatus('not shipped');
      setNotes(newNotes);

    } catch (error) {
      console.error('Error processing replacement:', error);
      alert('Failed to process replacement. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this order?')) {
      return;
    }
    setIsDeleting(true);
    try {
      const collectionName = order._collection || 'orders';
      const orderRef = doc(db, collectionName, order.id);
      await deleteDoc(orderRef);
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order. Please try again.');
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
          backgroundColor: '#1f1f23',
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
            {getStatusLabel(order.status)}
          </Box>
          <Typography
            sx={{
              color: '#3b82f6',
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
          {unassigned ? (
            <Tooltip title="Click to take this ticket">
              <Box
                onClick={handleClaimTicket}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: '#71717a',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: 'rgba(113, 113, 122, 0.1)',
                  px: 1,
                  py: 0.5,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    color: '#22c55e',
                  },
                }}
              >
                {isClaiming ? (
                  <CircularProgress size={12} sx={{ color: 'inherit' }} />
                ) : (
                  <PersonAddIcon sx={{ fontSize: 14 }} />
                )}
                <span>{isClaiming ? 'Claiming...' : 'n/a'}</span>
              </Box>
            </Tooltip>
          ) : (
            <Typography
              sx={{
                color: '#22c55e',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                px: 1,
                py: 0.5,
                borderRadius: '4px',
              }}
            >
              {employeeDisplay}
            </Typography>
          )}
          {order.dueDate && (
            <Typography sx={{ color: '#71717a', fontSize: '11px' }}>
              Ship By: {formatDate(order.dueDate)}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Body - Two Sections */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #27272a' }}>
        {/* Left: Database Details */}
        <Box sx={{ p: 2, borderRight: '1px solid #27272a' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#52525b' }}>
              Order Details (Database)
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 2 }}>
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

            {/* Sold For */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Sold For</Typography>
              <Typography sx={{ fontSize: '14px', color: '#fff', fontWeight: 600 }}>${formatCurrency(order.earnings)}</Typography>
            </Box>

            {/* Date Sold */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Date Sold</Typography>
              <Typography sx={{ fontSize: '12px', color: '#e4e4e7' }}>{formatDate(order.paidDate)}</Typography>
            </Box>

            {/* SKU */}
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>SKU</Typography>
              <Typography sx={{ fontSize: '12px', color: '#e4e4e7' }}>{order.itemId || '—'}</Typography>
            </Box>
          </Box>
        </Box>

        {/* Right: Editable Fields */}
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#22c55e', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#52525b' }}>
              Fulfillment Details (Editable)
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr', gap: 1.5, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Tracking Number</Typography>
              <TextField
                size="small"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Carrier</Typography>
              <TextField
                size="small"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Supplier</Typography>
              <TextField
                size="small"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 0.75fr 0.75fr', gap: 1.5, alignItems: 'end' }}>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Contact</Typography>
              <TextField
                size="small"
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'end', gap: 0.5 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Phone</Typography>
                <TextField
                  size="small"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  fullWidth
                  sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
                />
              </Box>
              {supplierPhone && (
                <IconButton
                  size="small"
                  href={`tel:${supplierPhone.replace(/\D/g, '')}`}
                  sx={{
                    backgroundColor: '#22c55e',
                    color: '#fff',
                    '&:hover': { backgroundColor: '#16a34a' },
                    width: 32,
                    height: 32,
                  }}
                >
                  <PhoneIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Buy Price</Typography>
              <TextField
                size="small"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                fullWidth
                sx={{ '& .MuiInputBase-input': { fontSize: '12px', py: 0.75 } }}
              />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '9px', color: '#71717a', textTransform: 'uppercase', mb: 0.5 }}>Shipping</Typography>
              <TextField
                size="small"
                value={shipPrice}
                onChange={(e) => setShipPrice(e.target.value)}
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
          {/* Tracking Progress - inline in footer */}
          {order.tracking && (
            <>
              <TrackingProgressBar
                status={trackingStatus}
                eta={trackingEta}
                isLoading={isTrackingLoading}
                onRefresh={() => fetchTrackingStatus(true)}
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
            variant="outlined"
            size="small"
            onClick={() => setEditDialogOpen(true)}
            startIcon={<EditIcon sx={{ fontSize: 14 }} />}
            sx={{
              fontSize: '11px',
              fontWeight: 600,
              minWidth: 70,
              borderColor: '#52525b',
              color: '#a1a1aa',
              '&:hover': {
                borderColor: '#71717a',
                backgroundColor: 'rgba(113, 113, 122, 0.1)',
              },
            }}
          >
            EDIT
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
              minWidth: 130,
              backgroundColor: '#52525b',
              color: '#fff',
              '& .MuiSelect-select': { py: 0.75 },
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            }}
          >
            <MenuItem value="not shipped">NOT SHIPPED</MenuItem>
            <MenuItem value="processing">PROCESSING</MenuItem>
            <MenuItem value="shipped">SHIPPED</MenuItem>
            <MenuItem value="delivered">DELIVERED</MenuItem>
            <MenuItem value="completed">COMPLETED</MenuItem>
            <MenuItem value="return">RETURN</MenuItem>
            <MenuItem value="return delivered">RETURN DELIVERED</MenuItem>
            <MenuItem value="refunded">REFUNDED</MenuItem>
            <MenuItem value="return done">RETURN DONE</MenuItem>
            <MenuItem value="return complete">RETURN COMPLETE</MenuItem>
          </Select>
        </Box>
      </Box>

      <CreateOrderDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        order={order}
      />

      <ReplacementDialog
        open={replacementDialogOpen}
        onClose={() => setReplacementDialogOpen(false)}
        onConfirm={handleReplacementConfirm}
      />

      <ItemProfileDialog
        open={itemProfileOpen}
        onClose={() => setItemProfileOpen(false)}
        itemName={order.item}
        itemId={order.itemId}
      />
    </Card>
  );
};
