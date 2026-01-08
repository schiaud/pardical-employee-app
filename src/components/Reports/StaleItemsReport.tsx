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
  TablePagination,
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
  FormControlLabel,
  Checkbox,
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
  runFullMigration,
  getLatestPricingData,
  getLatestEbayMetrics,
  markItemReviewed,
} from '../../services/staleItems';
import {
  ItemStats,
  StaleThreshold,
  CarPartVariant,
  VehicleInfo,
  PriceHistoryEntry,
  EbayMetricsEntry,
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
  const [sortBy, setSortBy] = useState<'daysSinceLastSale' | 'lastSaleDate' | 'reviewedAt'>('daysSinceLastSale');
  const [showHighSellers, setShowHighSellers] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

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
  const [importMode, setImportMode] = useState<'json' | 'html'>('json');
  const [jsonInput, setJsonInput] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; totalParsed?: number } | null>(null);

  // Migration state
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [fullMigrationLoading, setFullMigrationLoading] = useState(false);

  // Subcollection data (fetched separately from main items)
  const [pricingData, setPricingData] = useState<Map<string, PriceHistoryEntry>>(new Map());
  const [ebayData, setEbayData] = useState<Map<string, EbayMetricsEntry>>(new Map());

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

  // Fetch subcollection data for all items
  const fetchSubcollectionData = useCallback(async (itemIds: string[]) => {
    const pricingMap = new Map<string, PriceHistoryEntry>();
    const ebayMap = new Map<string, EbayMetricsEntry>();

    // Fetch in parallel batches of 10 to avoid overwhelming Firestore
    const batchSize = 10;
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (itemId) => {
          const [pricing, ebay] = await Promise.all([
            getLatestPricingData(itemId),
            getLatestEbayMetrics(itemId),
          ]);
          if (pricing) pricingMap.set(itemId, pricing);
          if (ebay) ebayMap.set(itemId, ebay);
        })
      );
    }

    setPricingData(pricingMap);
    setEbayData(ebayMap);
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getItemStats({ staleOnly: false });
      setItems(data);
      setFilteredItems(data);

      // Fetch subcollection data for all items
      const itemIds = data.map((item) => item.id);
      fetchSubcollectionData(itemIds);
    } catch (err) {
      console.error('Error fetching stale items:', err);
      setError('Failed to load item data.');
    } finally {
      setLoading(false);
    }
  }, [fetchSubcollectionData]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    let filtered = items.filter((item) =>
      item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (thresholdFilter !== 'all') {
      filtered = filtered.filter(
        (item) => item.daysSinceLastSale <= thresholdFilter
      );
    }

    // Filter by total sold: unchecked = ≤10, checked = >10
    if (showHighSellers) {
      filtered = filtered.filter((item) => item.totalSold > 10);
    } else {
      filtered = filtered.filter((item) => item.totalSold <= 10);
    }

    // Apply sorting
    if (sortBy === 'lastSaleDate') {
      filtered.sort((a, b) => b.lastSaleDate.getTime() - a.lastSaleDate.getTime());
    } else if (sortBy === 'reviewedAt') {
      // Never-reviewed first, then oldest reviewed
      filtered.sort((a, b) => {
        if (!a.reviewedAt && !b.reviewedAt) return 0;
        if (!a.reviewedAt) return -1;
        if (!b.reviewedAt) return 1;
        return a.reviewedAt.getTime() - b.reviewedAt.getTime();
      });
    } else {
      // Default: daysSinceLastSale desc
      filtered.sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
    }

    setFilteredItems(filtered);
    setPage(0);
  }, [searchTerm, thresholdFilter, items, showHighSellers, sortBy]);

  const handleThresholdChange = (event: SelectChangeEvent<StaleThreshold | 'all'>) => {
    setThresholdFilter(event.target.value as StaleThreshold | 'all');
  };

  const handleMarkReviewed = async (itemId: string) => {
    await markItemReviewed(itemId);
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, reviewedAt: new Date() } : item
      )
    );
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
        // Save pricing data and vehicle info to Firestore (writes to priceHistory subcollection)
        await savePriceCheck(priceCheckItem.id, {
          vehicleInfo: vehicleForm,
          pricingData: response.metrics,
        });

        // Update local pricingData map with new entry
        setPricingData((prev) => {
          const newMap = new Map(prev);
          newMap.set(priceCheckItem.id, {
            avgPrice: response.metrics!.avgPrice,
            minPrice: response.metrics!.minPrice,
            maxPrice: response.metrics!.maxPrice,
            totalListings: response.metrics!.totalListings,
            checkedAt: new Date(),
          });
          return newMap;
        });

        // Update vehicleInfo in items
        setItems((prev) =>
          prev.map((item) =>
            item.id === priceCheckItem.id
              ? { ...item, vehicleInfo: vehicleForm }
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
    setImportResult(null);
    try {
      const htmlContent = await file.text();
      const result = await importEbayData(htmlContent, 'html');

      if (result.success) {
        setImportResult({ imported: result.imported, totalParsed: result.totalParsed });
        await fetchItems();
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

  const handleJsonImport = async () => {
    if (!jsonInput.trim()) return;

    setImportLoading(true);
    setImportResult(null);
    setError(null);
    try {
      const result = await importEbayData(jsonInput, 'json');

      if (result.success) {
        setImportResult({ imported: result.imported, totalParsed: result.totalParsed });
        await fetchItems();
        setJsonInput('');
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

  const handleRunFullMigration = async () => {
    setFullMigrationLoading(true);
    try {
      const result = await runFullMigration();
      if (result.success) {
        alert(`Migration complete!\n\nItems created: ${result.itemsCreated}\nSales records: ${result.salesCreated}\nOrders processed: ${result.ordersProcessed}\nOrders without item: ${result.ordersSkippedNoItem}\nUsed fallback date: ${result.ordersUsedFallbackDate}`);
        await fetchItems();
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Full migration error:', err);
      setError('Failed to run full migration');
    } finally {
      setFullMigrationLoading(false);
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
            variant="contained"
            color="secondary"
            onClick={handleRunFullMigration}
            disabled={fullMigrationLoading}
          >
            {fullMigrationLoading ? 'Migrating All...' : 'Sync All Items'}
          </Button>
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

      <Box display="flex" gap={2} mb={3} flexWrap="wrap" alignItems="center">
        <TextField
          variant="outlined"
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ minWidth: 200, flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Threshold</InputLabel>
          <Select
            value={thresholdFilter}
            label="Threshold"
            onChange={handleThresholdChange}
          >
            <MenuItem value="all">All Items</MenuItem>
            <MenuItem value={90}>Less than 3 months</MenuItem>
            <MenuItem value={180}>Less than 6 months</MenuItem>
            <MenuItem value={365}>Less than 1 year</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={sortBy}
            label="Sort By"
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <MenuItem value="daysSinceLastSale">Days Since Last Sale</MenuItem>
            <MenuItem value="lastSaleDate">Last Sale Date</MenuItem>
            <MenuItem value="reviewedAt">Never Reviewed First</MenuItem>
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Checkbox
              checked={showHighSellers}
              onChange={(e) => setShowHighSellers(e.target.checked)}
              size="small"
            />
          }
          label="Show >10 sold"
        />
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
                  <TableCell align="center">Reviewed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((item) => (
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
                        {pricingData.get(item.id) ? (
                          <Tooltip
                            title={`Min: $${pricingData.get(item.id)!.minPrice} | Max: $${pricingData.get(item.id)!.maxPrice}`}
                          >
                            <Chip
                              label={`$${pricingData.get(item.id)!.avgPrice.toFixed(0)}`}
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
                        {ebayData.get(item.id) ? (
                          <Tooltip title={`${ebayData.get(item.id)!.watchers} watchers`}>
                            <Chip
                              label={`${ebayData.get(item.id)!.views30Day} views`}
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
                          {pricingData.get(item.id)?.checkedAt && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                              {formatRelativeDate(pricingData.get(item.id)!.checkedAt)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={item.reviewedAt ? `Reviewed: ${formatRelativeDate(item.reviewedAt)}` : 'Mark reviewed'}>
                          <Checkbox
                            checked={!!item.reviewedAt}
                            onChange={() => handleMarkReviewed(item.id)}
                            size="small"
                            color={item.reviewedAt ? 'success' : 'default'}
                          />
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={9} sx={{ py: 0, border: 0 }}>
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
          <TablePagination
            rowsPerPageOptions={[50, 100]}
            component="div"
            count={filteredItems.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
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
        onClose={() => {
          setImportDialogOpen(false);
          setImportResult(null);
          setError(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Import eBay Seller Hub Data</DialogTitle>
        <DialogContent>
          {/* Mode Toggle */}
          <Box display="flex" gap={1} mb={2} mt={1}>
            <Chip
              label="Paste JSON"
              color={importMode === 'json' ? 'primary' : 'default'}
              onClick={() => setImportMode('json')}
              clickable
            />
            <Chip
              label="Upload HTML"
              color={importMode === 'html' ? 'primary' : 'default'}
              onClick={() => setImportMode('html')}
              clickable
            />
          </Box>

          {importMode === 'json' ? (
            <Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                1. Go to your eBay Seller Hub &quot;Manage active listings&quot; page<br />
                2. Open browser DevTools (F12) → Console tab<br />
                3. Paste the extraction script and press Enter<br />
                4. Paste the copied JSON data below
              </Typography>
              <TextField
                multiline
                rows={8}
                fullWidth
                placeholder='[{"title": "...", "views": 123, "watchers": 5, "price": 99.99}]'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                disabled={importLoading}
                sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Script location: scripts/ebay-extractor.js
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Upload the saved HTML file from your eBay Seller Hub &quot;Manage active
                listings&quot; page. Note: This may not work if the page data is loaded
                dynamically.
              </Typography>
              <input
                type="file"
                accept=".html,.htm"
                onChange={handleEbayImport}
                disabled={importLoading}
                style={{ marginTop: 16 }}
              />
            </Box>
          )}

          {importLoading && (
            <Box display="flex" alignItems="center" gap={1} mt={2}>
              <CircularProgress size={20} />
              <Typography variant="body2">Importing...</Typography>
            </Box>
          )}

          {importResult && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Successfully matched {importResult.imported} items
              {importResult.totalParsed && ` (${importResult.totalParsed} total parsed from eBay)`}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportDialogOpen(false);
              setImportResult(null);
              setError(null);
            }}
          >
            {importResult ? 'Done' : 'Cancel'}
          </Button>
          {importMode === 'json' && !importResult && (
            <Button
              onClick={handleJsonImport}
              variant="contained"
              disabled={importLoading || !jsonInput.trim()}
            >
              Import
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};
