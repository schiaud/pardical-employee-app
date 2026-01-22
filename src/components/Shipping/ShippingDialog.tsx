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
  FormControlLabel,
  Checkbox,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  getShippingRates,
  purchaseShippingLabel,
  scheduleUSPSPickup,
  Address,
  ShippingRate,
  LabelResult,
  Shipment,
  PickupResult,
} from '../../services/shippoShipping';
import { Order } from '../../types';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../Auth/AuthContext';

interface ShippingDialogProps {
  open: boolean;
  onClose: () => void;
  order?: Order;
  onLabelPurchased?: (trackingNumber: string, carrier: string, shipPrice: string) => void;
}

// Warehouse address for quick-fill
const WAREHOUSE_ADDRESS: Address = {
  name: 'Pardical LLC',
  street1: '348 S Lyman Ave',
  street2: '',
  city: 'Des Plaines',
  state: 'IL',
  zip: '60016',
  country: 'US',
};

type Step = 'form' | 'rates' | 'pickup' | 'success';
type ToAddressSource = 'manual' | 'customer' | 'warehouse';

// Pickup location options from Shippo API
const PICKUP_LOCATIONS = [
  'Front Door',
  'Back Door',
  'Side Door',
  'Knock on Door/Ring Bell',
  'Mail Room',
  'Office',
  'Reception',
  'In/At Mailbox',
  'Security Deck',
  'Shipping Dock',
  'Other',
] as const;

// Check if a rate is eligible for free USPS pickup
const isPickupEligible = (rate: ShippingRate): boolean => {
  if (rate.provider !== 'USPS') return false;
  const service = rate.servicelevelName.toLowerCase();
  return service.includes('priority') ||
         service.includes('express') ||
         service.includes('ground advantage');
};

export const ShippingDialog: React.FC<ShippingDialogProps> = ({ open, onClose, order, onLabelPurchased }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FROM address
  const [fromName, setFromName] = useState('');
  const [fromStreet1, setFromStreet1] = useState('');
  const [fromStreet2, setFromStreet2] = useState('');
  const [fromCity, setFromCity] = useState('');
  const [fromState, setFromState] = useState('');
  const [fromZip, setFromZip] = useState('');
  const [fromCountry, setFromCountry] = useState('US');
  const [useWarehouseFrom, setUseWarehouseFrom] = useState(false);

  // TO address
  const [toName, setToName] = useState('');
  const [toStreet1, setToStreet1] = useState('');
  const [toStreet2, setToStreet2] = useState('');
  const [toCity, setToCity] = useState('');
  const [toState, setToState] = useState('');
  const [toZip, setToZip] = useState('');
  const [toCountry, setToCountry] = useState('US');
  const [toAddressSource, setToAddressSource] = useState<ToAddressSource>('manual');

  // Package dimensions
  const [weightLbs, setWeightLbs] = useState('');
  const [weightOz, setWeightOz] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // Rates step
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<string | null>(null);

  // Success step
  const [labelResult, setLabelResult] = useState<LabelResult | null>(null);

  // Pickup step
  const [pickupLocation, setPickupLocation] = useState('Front Door');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [pickupResult, setPickupResult] = useState<PickupResult | null>(null);
  const [selectedRateIsPickupEligible, setSelectedRateIsPickupEligible] = useState(false);

  // Initialize addresses when opened with an order
  useEffect(() => {
    if (open && order) {
      // Pre-fill FROM as warehouse when opened from a ticket
      handleUseWarehouseFrom(true);
      // If customer has address, pre-select customer as TO
      if (order.shipAddress && order.shipCity && order.shipState && order.shipZip) {
        handleToAddressSourceChange('customer');
      }
    }
  }, [open, order?.id]);

  const handleToAddressSourceChange = (source: ToAddressSource) => {
    setToAddressSource(source);
    if (source === 'customer' && order) {
      setToName(order.shipName || order.buyerUsername || '');
      setToStreet1(order.shipAddress || '');
      setToStreet2(order.shipAddress2 || '');
      setToCity(order.shipCity || '');
      setToState(order.shipState || '');
      setToZip(order.shipZip || '');
      setToCountry(order.shipCountry || 'US');
    } else if (source === 'warehouse') {
      setToName(WAREHOUSE_ADDRESS.name);
      setToStreet1(WAREHOUSE_ADDRESS.street1);
      setToStreet2(WAREHOUSE_ADDRESS.street2 || '');
      setToCity(WAREHOUSE_ADDRESS.city);
      setToState(WAREHOUSE_ADDRESS.state);
      setToZip(WAREHOUSE_ADDRESS.zip);
      setToCountry(WAREHOUSE_ADDRESS.country);
    }
  };

  const handleUseWarehouseFrom = (checked: boolean) => {
    setUseWarehouseFrom(checked);
    if (checked) {
      setFromName(WAREHOUSE_ADDRESS.name);
      setFromStreet1(WAREHOUSE_ADDRESS.street1);
      setFromStreet2(WAREHOUSE_ADDRESS.street2 || '');
      setFromCity(WAREHOUSE_ADDRESS.city);
      setFromState(WAREHOUSE_ADDRESS.state);
      setFromZip(WAREHOUSE_ADDRESS.zip);
      setFromCountry(WAREHOUSE_ADDRESS.country);
    }
  };

  const handleGetRates = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const fromAddress: Address = {
        name: fromName,
        street1: fromStreet1,
        street2: fromStreet2,
        city: fromCity,
        state: fromState,
        zip: fromZip,
        country: fromCountry,
      };

      const toAddress: Address = {
        name: toName,
        street1: toStreet1,
        street2: toStreet2,
        city: toCity,
        state: toState,
        zip: toZip,
        country: toCountry,
      };

      // Convert weight to ounces
      const totalOunces = (parseFloat(weightLbs) || 0) * 16 + (parseFloat(weightOz) || 0);

      const parcel = {
        length: parseFloat(length) || 1,
        width: parseFloat(width) || 1,
        height: parseFloat(height) || 1,
        weight: totalOunces || 16, // Default 1 lb if not specified
      };

      const fetchedRates = await getShippingRates(fromAddress, toAddress, parcel);

      // Sort by price (cheapest first)
      const sortedRates = fetchedRates.sort(
        (a, b) => parseFloat(a.amount) - parseFloat(b.amount)
      );

      setRates(sortedRates);
      setStep('rates');
    } catch (err) {
      console.error('Error getting rates:', err);
      setError(err instanceof Error ? err.message : 'Failed to get shipping rates');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchaseLabel = async () => {
    if (!selectedRate) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await purchaseShippingLabel(selectedRate);
      // Get carrier from our rates since Shippo transaction doesn't return it reliably
      const selectedRateData = rates.find((r) => r.objectId === selectedRate);
      const finalResult = {
        ...result,
        carrier: selectedRateData?.provider || result.carrier,
      };
      setLabelResult(finalResult);

      // Check if selected rate is eligible for free pickup
      const eligible = selectedRateData ? isPickupEligible(selectedRateData) : false;
      setSelectedRateIsPickupEligible(eligible);

      // Route to pickup step if eligible, otherwise go to success
      if (eligible) {
        setStep('pickup');
      } else {
        setStep('success');
      }

      // Save shipment to Firestore for label recovery
      const shipmentData: Omit<Shipment, 'id'> = {
        transactionId: finalResult.transactionId,
        trackingNumber: finalResult.trackingNumber,
        carrier: finalResult.carrier,
        labelUrl: finalResult.labelUrl,
        fromName: fromName,
        fromCity: fromCity,
        fromState: fromState,
        toName: toName,
        toCity: toCity,
        toState: toState,
        orderId: order?.id,
        orderNumber: order?.orderNumber,
        createdAt: new Date().toISOString(),
        createdBy: user?.displayName || user?.email || 'unknown',
      };
      await addDoc(collection(db, 'shipments'), shipmentData);

      // Call callback to update ticket with tracking info and shipping price
      if (onLabelPurchased && finalResult.trackingNumber && finalResult.carrier) {
        const shipPrice = selectedRateData?.amount || '0';
        onLabelPurchased(finalResult.trackingNumber, finalResult.carrier, shipPrice);
      }
    } catch (err) {
      console.error('Error purchasing label:', err);
      setError(err instanceof Error ? err.message : 'Failed to purchase label');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setStep('form');
    setError(null);
    setRates([]);
    setSelectedRate(null);
    setLabelResult(null);
    setFromName('');
    setFromStreet1('');
    setFromStreet2('');
    setFromCity('');
    setFromState('');
    setFromZip('');
    setFromCountry('US');
    setUseWarehouseFrom(false);
    setToName('');
    setToStreet1('');
    setToStreet2('');
    setToCity('');
    setToState('');
    setToZip('');
    setToCountry('US');
    setToAddressSource('manual');
    setWeightLbs('');
    setWeightOz('');
    setLength('');
    setWidth('');
    setHeight('');
    // Reset pickup state
    setPickupLocation('Front Door');
    setPickupInstructions('');
    setPickupResult(null);
    setSelectedRateIsPickupEligible(false);
    onClose();
  };

  const inputSx = {
    '& .MuiInputBase-input': { fontSize: '13px' },
    '& .MuiInputLabel-root': { fontSize: '13px' },
  };

  const renderFormStep = () => (
    <>
      <DialogContent sx={{ mt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* FROM Address Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
              <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
                Ship From
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={useWarehouseFrom}
                  onChange={(e) => handleUseWarehouseFrom(e.target.checked)}
                  size="small"
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 18 } }}
                />
              }
              label={<Typography sx={{ fontSize: '12px', color: '#a1a1aa' }}>Use Warehouse</Typography>}
            />
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Country"
                value={fromCountry}
                onChange={(e) => setFromCountry(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Street Address"
                value={fromStreet1}
                onChange={(e) => setFromStreet1(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Apt/Suite"
                value={fromStreet2}
                onChange={(e) => setFromStreet2(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="City"
                value={fromCity}
                onChange={(e) => setFromCity(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="State"
                value={fromState}
                onChange={(e) => setFromState(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="ZIP"
                value={fromZip}
                onChange={(e) => setFromZip(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Box>

        {/* TO Address Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
              <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
                Ship To
              </Typography>
            </Box>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={toAddressSource}
                onChange={(e) => handleToAddressSourceChange(e.target.value as ToAddressSource)}
                displayEmpty
                sx={{
                  fontSize: '12px',
                  '& .MuiSelect-select': { py: 0.75 },
                }}
              >
                <MenuItem value="manual">Manual Entry</MenuItem>
                {order && <MenuItem value="customer">Customer Address</MenuItem>}
                <MenuItem value="warehouse">Warehouse</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Name"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Country"
                value={toCountry}
                onChange={(e) => setToCountry(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Street Address"
                value={toStreet1}
                onChange={(e) => setToStreet1(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Apt/Suite"
                value={toStreet2}
                onChange={(e) => setToStreet2(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="City"
                value={toCity}
                onChange={(e) => setToCity(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="State"
                value={toState}
                onChange={(e) => setToState(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="ZIP"
                value={toZip}
                onChange={(e) => setToZip(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Box>

        {/* Package Dimensions Section */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
              Package Details
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Weight (lbs)"
                type="number"
                value={weightLbs}
                onChange={(e) => setWeightLbs(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Weight (oz)"
                type="number"
                value={weightOz}
                onChange={(e) => setWeightOz(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <TextField
                label="Length (in)"
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <TextField
                label="Width (in)"
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                fullWidth
                size="small"
                sx={inputSx}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <TextField
                label="Height (in)"
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
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
            '&:hover': { borderColor: '#52525b' },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleGetRates}
          variant="contained"
          disabled={isLoading || !fromStreet1 || !fromCity || !fromState || !fromZip || !toStreet1 || !toCity || !toState || !toZip}
          sx={{ minWidth: 120 }}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Get Rates'}
        </Button>
      </DialogActions>
    </>
  );

  const renderRatesStep = () => (
    <>
      <DialogContent sx={{ mt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
          <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
            Available Rates ({rates.length})
          </Typography>
        </Box>

        {rates.length === 0 ? (
          <Typography sx={{ color: '#a1a1aa', textAlign: 'center', py: 4 }}>
            No rates available for this shipment
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rates.map((rate) => (
              <Box
                key={rate.objectId}
                onClick={() => setSelectedRate(rate.objectId)}
                sx={{
                  p: 2,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: selectedRate === rate.objectId ? '#3b82f6' : '#27272a',
                  backgroundColor: selectedRate === rate.objectId ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  '&:hover': {
                    borderColor: selectedRate === rate.objectId ? '#3b82f6' : '#52525b',
                  },
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>
                      {rate.provider} - {rate.servicelevelName}
                    </Typography>
                    {isPickupEligible(rate) && (
                      <Chip
                        label="Free Pickup"
                        size="small"
                        sx={{
                          height: '20px',
                          fontSize: '10px',
                          fontWeight: 600,
                          backgroundColor: '#22c55e',
                          color: '#fff',
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '12px', color: '#a1a1aa' }}>
                    {rate.estimatedDays ? `${rate.estimatedDays} day${rate.estimatedDays > 1 ? 's' : ''}` : 'Delivery time varies'}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '16px', color: '#3b82f6' }}>
                  ${parseFloat(rate.amount).toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #27272a', p: 2 }}>
        <Button
          onClick={() => setStep('form')}
          variant="outlined"
          sx={{
            borderColor: '#27272a',
            color: '#a1a1aa',
            '&:hover': { borderColor: '#52525b' },
          }}
        >
          Back
        </Button>
        <Button
          onClick={handlePurchaseLabel}
          variant="contained"
          disabled={isLoading || !selectedRate}
          sx={{ minWidth: 140 }}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Purchase Label'}
        </Button>
      </DialogActions>
    </>
  );

  const handleSchedulePickup = async () => {
    if (!labelResult) return;

    setIsLoading(true);
    setError(null);

    try {
      const pickupAddress: Address = {
        name: fromName,
        street1: fromStreet1,
        street2: fromStreet2,
        city: fromCity,
        state: fromState,
        zip: fromZip,
        country: fromCountry,
      };

      const result = await scheduleUSPSPickup(
        labelResult.transactionId,
        pickupAddress,
        pickupLocation,
        pickupInstructions || undefined
      );

      setPickupResult(result);
      setStep('success');
    } catch (err) {
      console.error('Error scheduling pickup:', err);
      setError(err instanceof Error ? err.message : 'Failed to schedule pickup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipPickup = () => {
    setStep('success');
  };

  const renderPickupStep = () => (
    <>
      <DialogContent sx={{ mt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <LocalShippingIcon sx={{ fontSize: 48, color: '#22c55e', mb: 2 }} />
          <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#fff', mb: 1 }}>
            Schedule Free USPS Pickup?
          </Typography>
          <Typography sx={{ fontSize: '14px', color: '#a1a1aa' }}>
            USPS will pick up your package for free at your location
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 3, height: 12, backgroundColor: '#3b82f6', borderRadius: 1 }} />
            <Typography sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#71717a' }}>
              Pickup Details
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '13px' }}>Package Location</InputLabel>
                <Select
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  label="Package Location"
                  sx={{ fontSize: '13px' }}
                >
                  {PICKUP_LOCATIONS.map((location) => (
                    <MenuItem key={location} value={location}>
                      {location}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Special Instructions (optional)"
                value={pickupInstructions}
                onChange={(e) => setPickupInstructions(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={2}
                placeholder="e.g., Package is under the mat, ring doorbell twice..."
                sx={{
                  '& .MuiInputBase-input': { fontSize: '13px' },
                  '& .MuiInputLabel-root': { fontSize: '13px' },
                }}
              />
            </Grid>
          </Grid>
        </Box>

        <Alert severity="info" sx={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6' }}>
          Pickup will be scheduled for the next business day. Make sure your package is ready!
        </Alert>
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #27272a', p: 2 }}>
        <Button
          onClick={handleSkipPickup}
          variant="outlined"
          sx={{
            borderColor: '#27272a',
            color: '#a1a1aa',
            '&:hover': { borderColor: '#52525b' },
          }}
        >
          Skip
        </Button>
        <Button
          onClick={handleSchedulePickup}
          variant="contained"
          disabled={isLoading}
          sx={{ minWidth: 160, backgroundColor: '#22c55e', '&:hover': { backgroundColor: '#16a34a' } }}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Schedule Pickup'}
        </Button>
      </DialogActions>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <DialogContent sx={{ mt: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 4,
          }}
        >
          <CheckCircleIcon sx={{ fontSize: 64, color: '#22c55e', mb: 2 }} />
          <Typography sx={{ fontSize: '20px', fontWeight: 600, color: '#fff', mb: 1 }}>
            {pickupResult ? 'Label & Pickup Scheduled!' : 'Label Purchased!'}
          </Typography>
          <Typography sx={{ fontSize: '14px', color: '#a1a1aa', mb: 3 }}>
            {pickupResult ? 'Your shipping label and pickup are ready' : 'Your shipping label is ready'}
          </Typography>

          <Box
            sx={{
              backgroundColor: '#27272a',
              borderRadius: 1,
              p: 3,
              width: '100%',
              maxWidth: 400,
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase' }}>
                Carrier
              </Typography>
              <Typography sx={{ fontSize: '16px', color: '#fff', fontWeight: 500 }}>
                {labelResult?.carrier}
              </Typography>
            </Box>
            <Box sx={{ mb: pickupResult ? 2 : 0 }}>
              <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase' }}>
                Tracking Number
              </Typography>
              <Typography sx={{ fontSize: '16px', color: '#fff', fontWeight: 500, fontFamily: 'monospace' }}>
                {labelResult?.trackingNumber}
              </Typography>
            </Box>
            {pickupResult && (
              <>
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase' }}>
                    Pickup Confirmation
                  </Typography>
                  <Typography sx={{ fontSize: '16px', color: '#22c55e', fontWeight: 500, fontFamily: 'monospace' }}>
                    {pickupResult.confirmationNumber}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase' }}>
                    Pickup Location
                  </Typography>
                  <Typography sx={{ fontSize: '14px', color: '#fff', fontWeight: 500 }}>
                    {pickupLocation}
                  </Typography>
                </Box>
                <Alert
                  severity="success"
                  sx={{
                    mt: 2,
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid #22c55e',
                    '& .MuiAlert-icon': { color: '#22c55e' },
                  }}
                >
                  Pickup scheduled for next business day
                </Alert>
              </>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #27272a', p: 2 }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{
            borderColor: '#27272a',
            color: '#a1a1aa',
            '&:hover': { borderColor: '#52525b' },
          }}
        >
          Close
        </Button>
        <Button
          onClick={() => window.open(labelResult?.labelUrl, '_blank')}
          variant="contained"
          disabled={!labelResult?.labelUrl}
          sx={{ minWidth: 140 }}
        >
          Download Label
        </Button>
      </DialogActions>
    </>
  );

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
        },
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid #27272a', pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LocalShippingIcon sx={{ color: '#3b82f6' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '18px', color: '#fff' }}>
            {step === 'form' && 'Create Shipping Label'}
            {step === 'rates' && 'Select Shipping Rate'}
            {step === 'pickup' && 'Schedule Pickup'}
            {step === 'success' && (pickupResult ? 'Label & Pickup Confirmed' : 'Label Purchased')}
          </Typography>
        </Box>
      </DialogTitle>

      {step === 'form' && renderFormStep()}
      {step === 'rates' && renderRatesStep()}
      {step === 'pickup' && renderPickupStep()}
      {step === 'success' && renderSuccessStep()}
    </Dialog>
  );
};
