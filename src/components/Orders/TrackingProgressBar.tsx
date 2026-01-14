import React from 'react';
import { Box, Typography, IconButton, CircularProgress, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
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
  { key: 'processed', label: 'Processed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'enroute', label: 'En Route' },
  { key: 'arrived', label: 'Arrived' },
];

// Map Shippo status to step index (0-3)
function getStepFromStatus(status?: TrackingStatus): number {
  switch (status) {
    case 'PRE_TRANSIT':
      return 0; // Processed
    case 'TRANSIT':
      return 2; // En Route (skip shipped, go straight to en route since it's in transit)
    case 'DELIVERED':
      return 3; // Arrived
    case 'RETURNED':
      return 1; // Shipped (being returned)
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

function formatLastChecked(lastChecked?: string): string {
  if (!lastChecked) return '';
  try {
    const date = new Date(lastChecked);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const TrackingProgressBar: React.FC<TrackingProgressBarProps> = ({
  status,
  statusDetails,
  eta,
  isLoading,
  onRefresh,
  lastChecked,
}) => {
  const currentStep = getStepFromStatus(status);
  const isFailure = status === 'FAILURE';
  const isDelivered = status === 'DELIVERED';
  const etaFormatted = formatEta(eta);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        backgroundColor: '#18181b',
        borderBottom: '1px solid #27272a',
      }}
    >
      {/* Progress Steps */}
      <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        {STEPS.map((step, index) => {
          const isCompleted = currentStep >= index;
          const isCurrent = currentStep === index;
          const isLast = index === STEPS.length - 1;

          return (
            <React.Fragment key={step.key}>
              {/* Step Circle */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isFailure && isCurrent
                      ? '#ef4444'
                      : isCompleted
                        ? isDelivered && isLast
                          ? '#22c55e'
                          : '#3b82f6'
                        : '#3f3f46',
                    transition: 'all 0.3s',
                  }}
                >
                  {isDelivered && isLast ? (
                    <CheckCircleIcon sx={{ fontSize: 16, color: '#fff' }} />
                  ) : isFailure && isCurrent ? (
                    <ErrorIcon sx={{ fontSize: 16, color: '#fff' }} />
                  ) : (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: isCompleted ? '#fff' : '#71717a',
                      }}
                    />
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: '9px',
                    color: isCompleted ? '#e4e4e7' : '#52525b',
                    mt: 0.5,
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  {step.label}
                </Typography>
              </Box>

              {/* Connector Line */}
              {!isLast && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    backgroundColor: currentStep > index ? '#3b82f6' : '#3f3f46',
                    mx: 0.5,
                    mb: 2, // Offset for label
                    transition: 'all 0.3s',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </Box>

      {/* Status Details / ETA */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 100 }}>
        {etaFormatted && !isDelivered && (
          <Typography sx={{ fontSize: '10px', color: '#a1a1aa' }}>
            ETA: {etaFormatted}
          </Typography>
        )}
        {statusDetails && (
          <Tooltip title={statusDetails}>
            <Typography
              sx={{
                fontSize: '9px',
                color: '#71717a',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {statusDetails}
            </Typography>
          </Tooltip>
        )}
        {lastChecked && (
          <Typography sx={{ fontSize: '8px', color: '#52525b' }}>
            Updated: {formatLastChecked(lastChecked)}
          </Typography>
        )}
      </Box>

      {/* Refresh Button */}
      {onRefresh && (
        <Tooltip title={isDelivered ? 'Package delivered' : 'Refresh tracking'}>
          <span>
            <IconButton
              size="small"
              onClick={onRefresh}
              disabled={isLoading || isDelivered}
              sx={{
                color: '#71717a',
                '&:hover': { color: '#a1a1aa', backgroundColor: 'rgba(113, 113, 122, 0.1)' },
                '&.Mui-disabled': { color: '#3f3f46' },
              }}
            >
              {isLoading ? (
                <CircularProgress size={16} sx={{ color: '#71717a' }} />
              ) : (
                <RefreshIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
};
