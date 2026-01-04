import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SyncIcon from '@mui/icons-material/Sync';
import { ItemStats, SaleRecord, PriceHistoryEntry } from '../../types/staleItems';
import { getSalesForItem, formatCurrency, backfillSalesForItem, getPriceHistory } from '../../services/staleItems';

interface ItemSalesDetailProps {
  item: ItemStats;
}

const ItemSalesDetail: React.FC<ItemSalesDetailProps> = ({ item }) => {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillAttempted, setBackfillAttempted] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch sales and price history in parallel
      const [salesData, historyData] = await Promise.all([
        getSalesForItem(item.id),
        getPriceHistory(item.id),
      ]);

      setSales(salesData);
      setPriceHistory(historyData);
      setLoading(false);

      // Auto-backfill if no sales but item has totalSold > 0
      if (salesData.length === 0 && item.totalSold > 0 && !backfillAttempted) {
        setBackfillAttempted(true);
        setBackfilling(true);
        try {
          const result = await backfillSalesForItem(item.id, item.itemName);
          if (result.success && result.salesCreated && result.salesCreated > 0) {
            // Refetch sales after successful backfill
            const newSalesData = await getSalesForItem(item.id);
            setSales(newSalesData);
          }
        } catch (error) {
          console.error('Backfill error:', error);
        } finally {
          setBackfilling(false);
        }
      }
    };
    fetchData();
  }, [item.id, item.itemName, item.totalSold, backfillAttempted]);

  if (loading || backfilling) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, gap: 2 }}>
        <CircularProgress />
        {backfilling && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SyncIcon sx={{ animation: 'spin 1s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
            <Typography variant="body2" color="text.secondary">
              Populating sales data from orders...
            </Typography>
          </Box>
        )}
      </Box>
    );
  }

  // Calculate summary stats
  const totalRevenue = sales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
  const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
  const avgProfit = sales.length > 0 ? totalProfit / sales.length : 0;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Prepare chart data with timestamp for linear time scale
  // Filter out sales where purchase cost is $0 (unknown cost data)
  // Also filter out sales where shipCost is $0 to avoid skewing cost data
  const sortedSales = [...sales].sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
  const salesWithCost = sortedSales.filter(sale =>
    (sale.purchaseCost || 0) > 0 && (sale.shipCost || 0) > 0
  );

  // Sales data points (salePrice, buyPlusShip)
  const salesData = salesWithCost.map((sale, index) => ({
    timestamp: new Date(sale.saleDate).getTime(),
    date: new Date(sale.saleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
    fullDate: new Date(sale.saleDate).toLocaleDateString(),
    salePrice: sale.salePrice || 0,
    buyPlusShip: (sale.purchaseCost || 0) + (sale.shipCost || 0),
    profit: sale.profit || 0,
    margin: sale.profitMargin || 0,
    cumProfit: salesWithCost.slice(0, index + 1).reduce((sum, s) => sum + (s.profit || 0), 0),
    orderNumber: sale.orderNumber,
    carPartAvgPrice: null as number | null,
    views30Day: null as number | null,
  }));

  // Map ALL priceHistory entries for trend line (from subcollection)
  const priceHistoryData: typeof salesData = [];
  if (priceHistory && priceHistory.length > 0) {
    for (const entry of priceHistory) {
      priceHistoryData.push({
        timestamp: new Date(entry.checkedAt).getTime(),
        date: new Date(entry.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
        fullDate: new Date(entry.checkedAt).toLocaleDateString(),
        salePrice: null,
        buyPlusShip: null,
        profit: null,
        margin: null,
        cumProfit: null,
        orderNumber: null,
        carPartAvgPrice: entry.avgPrice || null,
        views30Day: entry.views30Day ?? null,
      });
    }
  }

  // Combine sales and price history, sort by timestamp
  const chartData = [...salesData, ...priceHistoryData].sort((a, b) => a.timestamp - b.timestamp);

  // Get time domain - include both sales and price history dates
  const allTimestamps = chartData.map(d => d.timestamp);
  const timeExtent = allTimestamps.length > 0
    ? [Math.min(...allTimestamps), Math.max(...allTimestamps, Date.now())]
    : [Date.now(), Date.now()];

  // Format timestamp for axis labels
  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Monthly aggregation for bar chart
  const monthlyData = sales.reduce((acc, sale) => {
    const month = new Date(sale.saleDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!acc[month]) {
      acc[month] = { month, sales: 0, revenue: 0, profit: 0 };
    }
    acc[month].sales++;
    acc[month].revenue += sale.salePrice || 0;
    acc[month].profit += sale.profit || 0;
    return acc;
  }, {} as Record<string, { month: string; sales: number; revenue: number; profit: number }>);
  const monthlyChartData = Object.values(monthlyData);

  // Profit distribution for pie chart
  const profitRanges = [
    { name: 'Loss (<$0)', value: sales.filter(s => (s.profit || 0) < 0).length, color: '#ff4444' },
    { name: '$0-$25', value: sales.filter(s => (s.profit || 0) >= 0 && (s.profit || 0) < 25).length, color: '#ffbb33' },
    { name: '$25-$50', value: sales.filter(s => (s.profit || 0) >= 25 && (s.profit || 0) < 50).length, color: '#00C851' },
    { name: '$50-$100', value: sales.filter(s => (s.profit || 0) >= 50 && (s.profit || 0) < 100).length, color: '#33b5e5' },
    { name: '$100+', value: sales.filter(s => (s.profit || 0) >= 100).length, color: '#aa66cc' },
  ].filter(r => r.value > 0);


  // Summary Card Component
  const SummaryCard = ({ title, value, subtitle, trend }: { title: string; value: string; subtitle?: string; trend?: 'up' | 'down' }) => (
    <Card sx={{ bgcolor: 'background.paper', height: '100%' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h5" fontWeight="bold">{value}</Typography>
          {trend === 'up' && <TrendingUpIcon color="success" fontSize="small" />}
          {trend === 'down' && <TrendingDownIcon color="error" fontSize="small" />}
        </Box>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </CardContent>
    </Card>
  );

  // Timeline View - Emphasizes chronological progression
  const PrototypeA = () => (
    <Box sx={{ p: 2 }}>
      {/* Summary Stats Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={2.4}>
          <SummaryCard title="Total Sales" value={sales.length.toString()} subtitle={`${formatCurrency(totalRevenue)} revenue`} />
        </Grid>
        <Grid item xs={2.4}>
          <SummaryCard title="Total Profit" value={formatCurrency(totalProfit)} trend={totalProfit > 0 ? 'up' : 'down'} />
        </Grid>
        <Grid item xs={2.4}>
          <SummaryCard title="Avg Profit/Sale" value={formatCurrency(avgProfit)} />
        </Grid>
        <Grid item xs={2.4}>
          <SummaryCard title="Avg Margin" value={`${avgMargin.toFixed(1)}%`} trend={avgMargin > 30 ? 'up' : 'down'} />
        </Grid>
        <Grid item xs={2.4}>
          <SummaryCard
            title="Market Pages"
            value={item.pricingData?.totalPages?.toString() || '-'}
            subtitle={item.pricingData ? `${item.pricingData.totalListings} listings` : 'No data'}
          />
        </Grid>
      </Grid>

      {/* Main Timeline Chart - Cumulative Profit */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Cumulative Profit Over Time</Typography>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={timeExtent}
              stroke="#888"
              fontSize={11}
              tickFormatter={formatTimestamp}
            />
            <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }}
              labelFormatter={(ts) => new Date(ts).toLocaleDateString()}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cumulative Profit']}
            />
            <Area type="monotone" dataKey="cumProfit" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </Paper>

      {/* Sale Price vs Cost Chart */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Sale Price vs Cost (Chronological)</Typography>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={timeExtent}
              stroke="#888"
              fontSize={11}
              tickFormatter={formatTimestamp}
            />
            {/* Left Y-axis for prices ($) */}
            <YAxis
              yAxisId="left"
              stroke="#888"
              fontSize={11}
              tickFormatter={(v) => `$${v}`}
            />
            {/* Right Y-axis for views (count) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#8884d8"
              fontSize={11}
              tickFormatter={(v) => v.toLocaleString()}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }}
              labelFormatter={(ts) => new Date(ts).toLocaleDateString()}
              formatter={(value: number | null, name: string) => {
                if (value === null) return ['-', name];
                if (name === 'Views (30 day)') return [value.toLocaleString(), name];
                return [`$${value.toFixed(2)}`, name];
              }}
            />
            <Legend />
            {/* Sale Price line (yellow, solid) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="salePrice"
              stroke="#ffc658"
              strokeWidth={2}
              dot={{ fill: '#ffc658', r: 3 }}
              name="Sale Price"
              connectNulls={false}
            />
            {/* Buy + Ship Cost line (green, solid) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="buyPlusShip"
              stroke="#82ca9d"
              strokeWidth={2}
              dot={{ fill: '#82ca9d', r: 3 }}
              name="Buy + Ship Cost"
              connectNulls={false}
            />
            {/* Market Avg line (orange, solid with dots) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="carPartAvgPrice"
              stroke="#ff5722"
              strokeWidth={2}
              dot={{ fill: '#ff5722', r: 4 }}
              name="Market Avg"
              connectNulls={true}
            />
            {/* Views line (purple, dashed) on secondary axis */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="views30Day"
              stroke="#8884d8"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={{ fill: '#8884d8', r: 3 }}
              name="Views (30 day)"
              connectNulls={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      {/* Sales Table */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>All Sales ({sales.length})</Typography>
        <TableContainer sx={{ maxHeight: 300 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: 'background.paper' }}>Date</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper' }} align="right">Sale Price</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper' }} align="right">Cost</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper' }} align="right">Profit</TableCell>
                <TableCell sx={{ bgcolor: 'background.paper' }} align="right">Margin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sales.map((sale, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{new Date(sale.saleDate).toLocaleDateString()}</TableCell>
                  <TableCell align="right">{formatCurrency(sale.salePrice || 0)}</TableCell>
                  <TableCell align="right">{formatCurrency((sale.purchaseCost || 0) + (sale.shipCost || 0))}</TableCell>
                  <TableCell align="right">
                    <Chip
                      label={formatCurrency(sale.profit || 0)}
                      size="small"
                      color={(sale.profit || 0) >= 0 ? 'success' : 'error'}
                      sx={{ minWidth: 70 }}
                    />
                  </TableCell>
                  <TableCell align="right">{(sale.profitMargin || 0).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  return (
    <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1 }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography variant="body2" color="text.secondary">Timeline View</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Full Item: {item.itemName}
        </Typography>
      </Box>

      {/* Timeline View */}
      <PrototypeA />
    </Box>
  );
};

export default ItemSalesDetail;
