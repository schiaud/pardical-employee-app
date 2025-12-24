import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Grid,
} from '@mui/material';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Order, OrderStatus } from '../../types';

interface OrderDialogProps {
  open: boolean;
  onClose: () => void;
  order?: Order; // If provided, we're in edit mode
}

export const CreateOrderDialog: React.FC<OrderDialogProps> = ({ open, onClose, order }) => {
  const isEditMode = !!order;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Order fields
  const [orderNumber, setOrderNumber] = useState('');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [earnings, setEarnings] = useState('');
  const [buyerUsername, setBuyerUsername] = useState('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);

  // Customer fields
  const [shipName, setShipName] = useState('');
  const [shipAddress, setShipAddress] = useState('');
  const [shipAddress2, setShipAddress2] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipZip, setShipZip] = useState('');
  const [shipPhone, setShipPhone] = useState('');

  // Optional fields
  const [itemId, setItemId] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (order && open) {
      setOrderNumber(order.orderNumber || '');
      setItem(order.item || '');
      setQuantity(String(order.quantity || 1));
      setEarnings(order.earnings || '');
      setBuyerUsername(order.buyerUsername || '');
      setPaidDate(order.paidDate || new Date().toISOString().split('T')[0]);
      setShipName(order.shipName || '');
      setShipAddress(order.shipAddress || '');
      setShipAddress2(order.shipAddress2 || '');
      setShipCity(order.shipCity || '');
      setShipState(order.shipState || '');
      setShipZip(order.shipZip || '');
      setShipPhone(order.shipPhone || '');
      setItemId(order.itemId || '');
      setDueDate(order.dueDate || '');
    } else if (!order && open) {
      resetForm();
    }
  }, [order, open]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const orderData: Record<string, unknown> = {
        orderNumber: orderNumber.trim() || `MANUAL-${Date.now()}`,
        item: item.trim() || 'Untitled Item',
        quantity: parseInt(quantity) || 1,
        earnings: earnings.trim() || '0',
        buyerUsername: buyerUsername.trim() || 'manual-entry',
        paidDate: paidDate || new Date().toISOString().split('T')[0],
        itemId: itemId.trim() || '',
        shipName: shipName.trim() || '',
        shipAddress: shipAddress.trim() || '',
        shipAddress2: shipAddress2.trim() || '',
        shipCity: shipCity.trim() || '',
        shipState: shipState.trim() || '',
        shipZip: shipZip.trim() || '',
        shipPhone: shipPhone.trim() || '',
        dueDate: dueDate || '',
      };

      if (isEditMode && order) {
        // Update existing order
        const orderRef = doc(db, 'orders', order.id);
        await updateDoc(orderRef, orderData);
      } else {
        // Create new order
        orderData.status = 'not shipped' as OrderStatus;
        orderData.employee = '';
        await addDoc(collection(db, 'orders'), orderData);
      }

      resetForm();
      onClose();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} order:`, error);
      alert(`Failed to ${isEditMode ? 'update' : 'create'} order. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setOrderNumber('');
    setItem('');
    setQuantity('1');
    setEarnings('');
    setBuyerUsername('');
    setPaidDate(new Date().toISOString().split('T')[0]);
    setShipName('');
    setShipAddress('');
    setShipAddress2('');
    setShipCity('');
    setShipState('');
    setShipZip('');
    setShipPhone('');
    setItemId('');
    setDueDate('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const inputSx = {
    '& .MuiInputBase-input': { fontSize: '13px' },
    '& .MuiInputLabel-root': { fontSize: '13px' },
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid #27272a', pb: 2 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '18px', color: '#fff' }}>
          {isEditMode ? 'Edit Order Details' : 'Create New Order'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ mt: 2 }}>
        {/* Order Details Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
              Order Details
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="Order Number"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 6 }}>
              <TextField
                label="Item Name"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="SKU"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="Quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="Sold For ($)"
                value={earnings}
                onChange={(e) => setEarnings(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="Date Sold"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                label="Ship By Date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Box>

        {/* Customer Information Section */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
              Customer Information
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label="Buyer Username"
                value={buyerUsername}
                onChange={(e) => setBuyerUsername(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label="Ship To Name"
                value={shipName}
                onChange={(e) => setShipName(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label="Phone"
                value={shipPhone}
                onChange={(e) => setShipPhone(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Address Line 1"
                value={shipAddress}
                onChange={(e) => setShipAddress(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Address Line 2"
                value={shipAddress2}
                onChange={(e) => setShipAddress2(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="City"
                value={shipCity}
                onChange={(e) => setShipCity(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="State"
                value={shipState}
                onChange={(e) => setShipState(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="ZIP Code"
                value={shipZip}
                onChange={(e) => setShipZip(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #27272a', p: 2 }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{
            borderColor: '#27272a',
            color: '#a1a1aa',
            '&:hover': { borderColor: '#52525b' }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
          sx={{ minWidth: 120 }}
        >
          {isSubmitting ? <CircularProgress size={20} /> : (isEditMode ? 'Save Changes' : 'Create Order')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
