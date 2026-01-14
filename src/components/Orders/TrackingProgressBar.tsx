import React from 'react';
import { Box, Typography, IconButton, CircularProgress, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { TrackingStatus } from '../../services/shippo';

interface TrackingProgressBarProps {
  status?: TrackingStatus;
  statusDetails?: string;
  eta?: string | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  lastChecked?: string;
}

const STEPS = [
  { key: 'pre_transit', label: 'Pre Transit' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

// Map Shippo status to step index (0-2)
function getStepFromStatus(status?: TrackingStatus): number {
  switch (status) {
    case 'PRE_TRANSIT':
      return 0; // Pre Transit
    case 'TRANSIT':
      return 1; // In Transit
    case 'DELIVERED':
      return 2; // Delivered
    case 'RETURNED':
      return 1; // Treat as In Transit
    case 'FAILURE':
    case 'UNKNOWN':
    default:
      return -1; // No valid step
  }
}

function formatEta(eta?: string | null): string {
  if (!eta) return '';
  try {
    const date = new Date(eta);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Style A: Minimalist Dots - Inline version for footer
 * Shows small dots connected by lines, current status text, and golden ETA badge
 */
export const TrackingProgressBar: React.FC<TrackingProgressBarProps> = ({
  status,
  eta,
  isLoading,
  onRefresh,
}) => {
  const currentStep = getStepFromStatus(status);
  const isDelivered = status === 'DELIVERED';
  const etaFormatted = formatEta(eta);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      {/* Simple dot progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {STEPS.map((step, index) => {
          const isCompleted = currentStep >= index;
          const isLast = index === STEPS.length - 1;

          return (
            <React.Fragment key={step.key}>
              <Tooltip title={step.label}>
                <Box
                  sx={{
                    width: isCompleted ? 10 : 8,
                    height: isCompleted ? 10 : 8,
                    borderRadius: '50%',
                    backgroundColor: isCompleted
                      ? isDelivered && isLast ? '#22c55e' : '#60a5fa'
                      : '#3f3f46',
                    transition: 'all 0.3s ease',
                    boxShadow: isCompleted ? '0 0 6px rgba(96, 165, 250, 0.3)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isDelivered && isLast && (
                    <CheckCircleIcon sx={{ fontSize: 10, color: '#fff' }} />
                  )}
                </Box>
              </Tooltip>
              {!isLast && (
                <Box
                  sx={{
                    width: 16,
                    height: 1,
                    backgroundColor: currentStep > index ? '#60a5fa' : '#27272a',
                    transition: 'all 0.3s',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </Box>

      {/* Current status text */}
      <Typography sx={{ fontSize: '10px', color: '#a1a1aa', fontWeight: 500 }}>
        {isDelivered ? '✓ Delivered' : STEPS[Math.max(0, currentStep)]?.label || 'Pending'}
      </Typography>

      {/* Golden ETA badge - only show when carrier has the package (not PRE_TRANSIT) */}
      {etaFormatted && !isDelivered && status !== 'PRE_TRANSIT' && (
        <Box
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 1,
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.4)',
          }}
        >
          <Typography sx={{ fontSize: '10px', color: '#fbbf24', fontWeight: 500 }}>
            ETA {etaFormatted}
          </Typography>
        </Box>
      )}

      {/* Refresh button */}
      {onRefresh && !isDelivered && (
        <IconButton
          size="small"
          onClick={onRefresh}
          disabled={isLoading}
          sx={{ color: '#52525b', p: 0.25, '&:hover': { color: '#71717a' } }}
        >
          {isLoading ? (
            <CircularProgress size={12} sx={{ color: '#52525b' }} />
          ) : (
            <RefreshIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      )}
    </Box>
  );
};
