import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Warning as WarningIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import {
  subscribeToStaleItems,
  getStaleStatusColor,
  formatDaysSinceLastSale,
} from '../../services/staleItems';
import { ItemStats } from '../../types/staleItems';

export const StaleItemsWidget: React.FC = () => {
  const [staleItems, setStaleItems] = useState<ItemStats[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);

    // Subscribe to real-time updates for top 5 stale items
    const unsubscribe = subscribeToStaleItems((items) => {
      setStaleItems(items);
      setLoading(false);
    }, 5);

    return () => unsubscribe();
  }, []);

  const handleViewAll = () => {
    navigate('/reports/stale');
  };

  if (loading) {
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (staleItems.length === 0) {
    return null; // Don't show widget if no stale items
  }

  return (
    <Card sx={{ mb: 2, border: '1px solid #dc2626' }}>
      <CardContent sx={{ pb: 1 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <WarningIcon color="error" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={600}>
              Stale Items Alert
            </Typography>
            <Chip
              label={staleItems.length}
              size="small"
              color="error"
              sx={{ height: 20, fontSize: 11 }}
            />
          </Box>
          <Tooltip title="View all stale items">
            <IconButton size="small" onClick={handleViewAll}>
              <ArrowForwardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <List dense disablePadding>
          {staleItems.map((item) => (
            <ListItem
              key={item.id}
              disableGutters
              sx={{
                py: 0.5,
                borderBottom: '1px solid #27272a',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 200,
                    }}
                  >
                    {item.itemName}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    Sold {item.totalSold} times
                  </Typography>
                }
              />
              <Chip
                label={formatDaysSinceLastSale(item.daysSinceLastSale)}
                size="small"
                color={getStaleStatusColor(item.daysSinceLastSale)}
                sx={{ ml: 1, height: 22, fontSize: 11 }}
              />
            </ListItem>
          ))}
        </List>

        <Box
          display="flex"
          justifyContent="center"
          mt={1}
          pt={1}
          borderTop="1px solid #27272a"
        >
          <Typography
            variant="caption"
            color="primary"
            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={handleViewAll}
          >
            View Full Report
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};
