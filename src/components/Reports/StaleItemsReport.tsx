import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Box,
  Alert,
  TextField,
  Chip,
  IconButton,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Tooltip,
  SelectChangeEvent,
  Autocomplete,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Upload as UploadIcon,
  AttachMoney as PriceIcon,
} from '@mui/icons-material';
import {
  getYears,
  getMakes,
  getModelsForMake,
  getParts,
  searchParts,
} from '../../data/carPartData';
import {
  getItemStats,
  getStaleStatusColor,
  formatDaysSinceLastSale,
  checkCarPartPricing,
  checkCarPartVariants,
  savePriceCheck,
  importEbayData,
  runMigration,
} from '../../services/staleItems';
import {
  ItemStats,
  StaleThreshold,
  CarPartVariant,
  VehicleInfo,
} from '../../types/staleItems';
import ItemSalesDetail from './ItemSalesDetail';

export const StaleItemsReport: React.FC = () => {
  const [items, setItems] = useState<ItemStats[]>([]);
  const [filteredItems, setFilteredItems] = useState<ItemStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [thresholdFilter, setThresholdFilter] = useState<StaleThreshold | 'all'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Price check dialog state
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceCheckItem, setPriceCheckItem] = useState<ItemStats | null>(null);
  const [priceCheckLoading, setPriceCheckLoading] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<VehicleInfo>({
    year: '',
    make: '',
    model: '',
    part: '',
  });
  const [variants, setVariants] = useState<CarPartVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  // Car-part.com dropdown options
  const years = useMemo(() => getYears(), []);
  const makes = useMemo(() => getMakes(), []);
  const [models, setModels] = useState<string[]>([]);
  const allParts = useMemo(() => getParts(), []);
  const [partSearchResults, setPartSearchResults] = useState<{ value: string; text: string }[]>([]);
  const [partInputValue, setPartInputValue] = useState('');

  // eBay import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Migration state
  const [migrationLoading, setMigrationLoading] = useState(false);

  // Format date as relative time (e.g., "3d ago", "2w ago")
  const formatRelativeDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getItemStats({ staleOnly: false });
      setItems(data);
      setFilteredItems(data);
    } catch (err) {
      console.error('Error fetching stale items:', err);
      setError('Failed to load item data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    let filtered = items.filter((item) =>
      item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (thresholdFilter !== 'all') {
      filtered = filtered.filter(
        (item) => item.daysSinceLastSale >= thresholdFilter
      );
    }

    setFilteredItems(filtered);
  }, [searchTerm, thresholdFilter, items]);

  const handleThresholdChange = (event: SelectChangeEvent<StaleThreshold | 'all'>) => {
    setThresholdFilter(event.target.value as StaleThreshold | 'all');
  };

  const handlePriceCheck = (item: ItemStats) => {
    setPriceCheckItem(item);
    if (item.vehicleInfo) {
      setVehicleForm(item.vehicleInfo);
      // Load models for the make if exists
      if (item.vehicleInfo.make) {
        setModels(getModelsForMake(item.vehicleInfo.make));
      }
      setPartInputValue(item.vehicleInfo.part || '');
      setVariants([]);
    } else {
      setVehicleForm({ year: '', make: '', model: '', part: '' });
      setModels([]);
      setPartInputValue('');
      setVariants([]);
    }
    setPriceDialogOpen(true);
  };

  // Update models when make changes
  const handleMakeChange = (make: string) => {
    setVehicleForm((prev) => ({ ...prev, make, model: '' }));
    setModels(make ? getModelsForMake(make) : []);
    setVariants([]);
  };

  // Handle part search
  const handlePartSearch = (query: string) => {
    setPartInputValue(query);
    if (query.length >= 2) {
      setPartSearchResults(searchParts(query, 30));
    } else {
      setPartSearchResults([]);
    }
  };

  const handleCheckVariants = async () => {
    if (!vehicleForm.year || !vehicleForm.make || !vehicleForm.model || !vehicleForm.part) {
      return;
    }

    setVariantsLoading(true);
    try {
      const response = await checkCarPartVariants({
        year: vehicleForm.year,
        make: vehicleForm.make,
        model: vehicleForm.model,
        part: vehicleForm.part,
      });

      if (response.success && response.variants) {
        setVariants(response.variants);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      console.error('Error checking variants:', err);
    } finally {
      setVariantsLoading(false);
    }
  };

  const handleRunPriceCheck = async () => {
    if (!priceCheckItem) return;

    setPriceCheckLoading(true);
    try {
      const response = await checkCarPartPricing({
        year: vehicleForm.year,
        make: vehicleForm.make,
        model: vehicleForm.model,
        part: vehicleForm.part,
        variantValue: vehicleForm.variantValue,
      });

      if (response.success && response.metrics) {
        // Save pricing data and vehicle info to Firestore (also adds to priceHistory subcollection)
        await savePriceCheck(priceCheckItem.id, {
          vehicleInfo: vehicleForm,
          pricingData: response.metrics,
        });

        // Update local state with lastUpdated
        setItems((prev) =>
          prev.map((item) =>
            item.id === priceCheckItem.id
              ? {
                  ...item,
                  pricingData: { ...response.metrics, lastUpdated: new Date() },
                  vehicleInfo: vehicleForm,
                }
              : item
          )
        );

        setPriceDialogOpen(false);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      console.error('Error running price check:', err);
      setError('Failed to check pricing');
    } finally {
      setPriceCheckLoading(false);
    }
  };

  const handleEbayImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const htmlContent = await file.text();
      const result = await importEbayData(htmlContent);

      if (result.success) {
        await fetchItems();
        setImportDialogOpen(false);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Error importing eBay data:', err);
      setError('Failed to import eBay data');
    } finally {
      setImportLoading(false);
    }
  };

  const handleRunMigration = async () => {
    setMigrationLoading(true);
    try {
      const result = await runMigration();
      if (result.success) {
        await fetchItems();
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Migration error:', err);
      setError('Failed to run migration');
    } finally {
      setMigrationLoading(false);
    }
  };

  const getRowColor = (daysSinceLastSale: number): string => {
    if (daysSinceLastSale < 30) return 'transparent';
    if (daysSinceLastSale < 60) return 'rgba(249, 115, 22, 0.1)';
    if (daysSinceLastSale < 90) return 'rgba(234, 179, 8, 0.1)';
    return 'rgba(220, 38, 38, 0.15)';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Stale Items Report
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track items that haven't sold recently and check market pricing
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          {items.length === 0 && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleRunMigration}
              disabled={migrationLoading}
            >
              {migrationLoading ? 'Migrating...' : 'Run Migration'}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setImportDialogOpen(true)}
          >
            Import eBay Data
          </Button>
          <IconButton onClick={fetchItems} title="Refresh">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box display="flex" gap={2} mb={3}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Threshold</InputLabel>
          <Select
            value={thresholdFilter}
            label="Threshold"
            onChange={handleThresholdChange}
          >
            <MenuItem value="all">All Items</MenuItem>
            <MenuItem value={30}>30+ Days</MenuItem>
            <MenuItem value={60}>60+ Days</MenuItem>
            <MenuItem value={90}>90+ Days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {filteredItems.length === 0 ? (
        <Alert severity="info">
          {searchTerm || thresholdFilter !== 'all'
            ? 'No items found matching your filters.'
            : 'No item stats data found. Run the migration to populate data.'}
        </Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Showing {filteredItems.length} of {items.length} items
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }}></TableCell>
                  <TableCell>Item Name</TableCell>
                  <TableCell align="center">Total Sold</TableCell>
                  <TableCell align="center">Last Sale</TableCell>
                  <TableCell align="center">Velocity</TableCell>
                  <TableCell align="center">Car-Part Price</TableCell>
                  <TableCell align="center">eBay Views</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <TableRow
                      sx={{
                        backgroundColor: getRowColor(item.daysSinceLastSale),
                        '&:hover': { backgroundColor: '#27272a' },
                      }}
                    >
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() =>
                            setExpandedRow(expandedRow === item.id ? null : item.id)
                          }
                        >
                          {expandedRow === item.id ? (
                            <ExpandLessIcon />
                          ) : (
                            <ExpandMoreIcon />
                          )}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.itemName}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">{item.totalSold}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={formatDaysSinceLastSale(item.daysSinceLastSale)}
                          size="small"
                          color={getStaleStatusColor(item.daysSinceLastSale)}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {item.salesVelocity.toFixed(1)}/week
                      </TableCell>
                      <TableCell align="center">
                        {item.pricingData ? (
                          <Tooltip
                            title={`Min: $${item.pricingData.minPrice} | Max: $${item.pricingData.maxPrice}`}
                          >
                            <Chip
                              label={`$${item.pricingData.avgPrice.toFixed(0)}`}
                              size="small"
                              color="primary"
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {item.ebayMetrics ? (
                          <Tooltip title={`${item.ebayMetrics.watchers} watchers`}>
                            <Chip
                              label={`${item.ebayMetrics.views30Day} views`}
                              size="small"
                              variant="outlined"
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                          <Tooltip title={item.vehicleInfo ? 'Re-check price' : 'Check price'}>
                            <IconButton
                              size="small"
                              onClick={() => handlePriceCheck(item)}
                              color={item.vehicleInfo ? 'primary' : 'default'}
                            >
                              <PriceIcon />
                            </IconButton>
                          </Tooltip>
                          {item.pricingData?.lastUpdated && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                              {formatRelativeDate(item.pricingData.lastUpdated)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={8} sx={{ py: 0, border: 0 }}>
                        <Collapse
                          in={expandedRow === item.id}
                          timeout="auto"
                          unmountOnExit
                        >
                          <ItemSalesDetail item={item} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Price Check Dialog */}
      <Dialog
        open={priceDialogOpen}
        onClose={() => setPriceDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Check Car-Part.com Pricing</DialogTitle>
        <DialogContent>
          {priceCheckItem && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {priceCheckItem.itemName}
              </Typography>

              <Box display="flex" flexDirection="column" gap={2}>
                {/* Year Dropdown */}
                <FormControl size="small" fullWidth>
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={vehicleForm.year}
                    label="Year"
                    onChange={(e) => {
                      setVehicleForm((prev) => ({ ...prev, year: e.target.value }));
                      setVariants([]);
                    }}
                  >
                    {years.map((year) => (
                      <MenuItem key={year} value={year.toString()}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Make Dropdown */}
                <Autocomplete
                  size="small"
                  options={makes}
                  value={vehicleForm.make || null}
                  onChange={(_, newValue) => handleMakeChange(newValue || '')}
                  renderInput={(params) => <TextField {...params} label="Make" />}
                  isOptionEqualToValue={(option, value) => option === value}
                />

                {/* Model Dropdown */}
                <Autocomplete
                  size="small"
                  options={models}
                  value={vehicleForm.model || null}
                  onChange={(_, newValue) => {
                    setVehicleForm((prev) => ({ ...prev, model: newValue || '' }));
                    setVariants([]);
                  }}
                  disabled={!vehicleForm.make}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Model"
                      placeholder={vehicleForm.make ? 'Select model' : 'Select make first'}
                    />
                  )}
                  isOptionEqualToValue={(option, value) => option === value}
                />

                {/* Part Autocomplete */}
                <Autocomplete
                  size="small"
                  options={partInputValue.length >= 2 ? partSearchResults : allParts}
                  getOptionLabel={(option) => (typeof option === 'string' ? option : option.text)}
                  value={
                    vehicleForm.part
                      ? allParts.find((p) => p.text === vehicleForm.part) || { value: '', text: vehicleForm.part }
                      : null
                  }
                  onChange={(_, newValue) => {
                    const partText = typeof newValue === 'string' ? newValue : newValue?.text || '';
                    setVehicleForm((prev) => ({ ...prev, part: partText }));
                    setPartInputValue(partText);
                    setVariants([]);
                  }}
                  onInputChange={(_, newInputValue) => handlePartSearch(newInputValue)}
                  inputValue={partInputValue}
                  renderInput={(params) => (
                    <TextField {...params} label="Part" placeholder="Search for a part..." />
                  )}
                  filterOptions={(options) => options}
                  isOptionEqualToValue={(option, value) =>
                    (typeof option === 'string' ? option : option.text) ===
                    (typeof value === 'string' ? value : value.text)
                  }
                />

                <Button
                  variant="outlined"
                  onClick={handleCheckVariants}
                  disabled={
                    variantsLoading ||
                    !vehicleForm.year ||
                    !vehicleForm.make ||
                    !vehicleForm.model ||
                    !vehicleForm.part
                  }
                >
                  {variantsLoading ? 'Checking...' : 'Check Variants'}
                </Button>

                {variants.length > 0 && (
                  <FormControl size="small">
                    <InputLabel>Variant</InputLabel>
                    <Select
                      value={vehicleForm.variantValue || ''}
                      label="Variant"
                      onChange={(e) =>
                        setVehicleForm((prev) => ({
                          ...prev,
                          variantValue: e.target.value,
                          variantLabel: variants.find((v) => v.value === e.target.value)
                            ?.label,
                        }))
                      }
                    >
                      {variants.map((variant) => (
                        <MenuItem key={variant.value} value={variant.value}>
                          {variant.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPriceDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRunPriceCheck}
            variant="contained"
            disabled={
              priceCheckLoading ||
              !vehicleForm.year ||
              !vehicleForm.make ||
              !vehicleForm.model ||
              !vehicleForm.part
            }
          >
            {priceCheckLoading ? 'Checking...' : 'Check Price'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* eBay Import Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Import eBay Seller Hub Data</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph sx={{ mt: 1 }}>
            Upload the saved HTML file from your eBay Seller Hub "Manage active listings"
            page to import views and watcher data.
          </Typography>
          <input
            type="file"
            accept=".html,.htm"
            onChange={handleEbayImport}
            disabled={importLoading}
            style={{ marginTop: 16 }}
          />
          {importLoading && (
            <Box display="flex" alignItems="center" gap={1} mt={2}>
              <CircularProgress size={20} />
              <Typography variant="body2">Importing...</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
