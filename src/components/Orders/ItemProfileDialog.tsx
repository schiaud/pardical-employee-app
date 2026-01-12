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
  IconButton,
  Link,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuth } from '../Auth/AuthContext';
import {
  getOrCreateItemProfile,
  updateItemProfile,
  normalizeItemName,
} from '../../services/itemProfiles';
import { ItemProfile } from '../../types';

interface ItemProfileDialogProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemId?: string;
}

export const ItemProfileDialog: React.FC<ItemProfileDialogProps> = ({
  open,
  onClose,
  itemName,
  itemId,
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<ItemProfile | null>(null);

  // Form fields
  const [notes, setNotes] = useState('');
  const [ebayListingUrl, setEbayListingUrl] = useState('');
  const [ebayItemId, setEbayItemId] = useState<string | undefined>();
  const [qualityNotes, setQualityNotes] = useState('');
  const [vehicleFitment, setVehicleFitment] = useState('');

  // Load profile when dialog opens
  useEffect(() => {
    if (open && itemName) {
      loadProfile();
    }
  }, [open, itemName]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const profileData = await getOrCreateItemProfile(
        itemName,
        itemId,
        user?.email || undefined
      );
      setProfile(profileData);
      setNotes(profileData.notes || '');
      // Pre-fill with default eBay URL if no custom URL is saved
      // Use ebayItemId from itemStats, or fall back to itemId prop (which may be the eBay item ID)
      const ebayId = profileData.ebayItemId || itemId;
      setEbayListingUrl(
        profileData.ebayListingUrl ||
        (ebayId ? `https://www.ebay.com/itm/${ebayId}` : '')
      );
      setEbayItemId(profileData.ebayItemId);
      setQualityNotes(profileData.qualityNotes || '');
      setVehicleFitment(profileData.vehicleFitment || '');
    } catch (error) {
      console.error('Error loading item profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    setIsSaving(true);
    try {
      await updateItemProfile(
        profile.id,
        {
          notes,
          ebayListingUrl,
          qualityNotes,
          vehicleFitment,
          itemId: itemId || profile.itemId,
        },
        user?.email || ''
      );
      onClose();
    } catch (error) {
      console.error('Error saving item profile:', error);
      alert('Failed to save item profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const inputSx = {
    '& .MuiInputBase-input': { fontSize: '13px' },
    '& .MuiInputLabel-root': { fontSize: '13px' },
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
        },
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid #27272a', pb: 2 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '16px',
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {itemName}
        </Typography>
        {itemId && (
          <Typography sx={{ fontSize: '12px', color: '#71717a', mt: 0.5 }}>
            SKU: {itemId}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent sx={{ mt: 2 }}>
        {isLoading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 4,
            }}
          >
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Notes */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box
                  sx={{
                    width: 3,
                    height: 12,
                    backgroundColor: '#3b82f6',
                    borderRadius: 1,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#71717a',
                  }}
                >
                  Notes
                </Typography>
              </Box>
              <TextField
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="General notes about this item..."
                size="small"
                sx={inputSx}
              />
            </Box>

            {/* eBay Listing URL */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box
                  sx={{
                    width: 3,
                    height: 12,
                    backgroundColor: '#22c55e',
                    borderRadius: 1,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#71717a',
                  }}
                >
                  eBay Listing URL
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  value={ebayListingUrl}
                  onChange={(e) => setEbayListingUrl(e.target.value)}
                  fullWidth
                  placeholder="https://www.ebay.com/itm/..."
                  size="small"
                  sx={inputSx}
                />
                {(() => {
                  // Use custom URL if set, otherwise use default from ebayItemId
                  const displayUrl = ebayListingUrl || (ebayItemId ? `https://www.ebay.com/itm/${ebayItemId}` : '');
                  return isValidUrl(displayUrl) ? (
                    <IconButton
                      component={Link}
                      href={displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                      sx={{ color: '#3b82f6' }}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  ) : null;
                })()}
              </Box>
            </Box>

            {/* Quality Notes */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box
                  sx={{
                    width: 3,
                    height: 12,
                    backgroundColor: '#f59e0b',
                    borderRadius: 1,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#71717a',
                  }}
                >
                  Quality Notes
                </Typography>
              </Box>
              <TextField
                value={qualityNotes}
                onChange={(e) => setQualityNotes(e.target.value)}
                fullWidth
                multiline
                rows={2}
                placeholder="Known issues, inspection points, return rate info..."
                size="small"
                sx={inputSx}
              />
            </Box>

            {/* Vehicle Fitment */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box
                  sx={{
                    width: 3,
                    height: 12,
                    backgroundColor: '#8b5cf6',
                    borderRadius: 1,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#71717a',
                  }}
                >
                  Vehicle Fitment
                </Typography>
              </Box>
              <TextField
                value={vehicleFitment}
                onChange={(e) => setVehicleFitment(e.target.value)}
                fullWidth
                multiline
                rows={2}
                placeholder="Year/make/model compatibility notes..."
                size="small"
                sx={inputSx}
              />
            </Box>
          </Box>
        )}
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
          onClick={handleSave}
          variant="contained"
          disabled={isSaving || isLoading}
          sx={{ minWidth: 100 }}
        >
          {isSaving ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
