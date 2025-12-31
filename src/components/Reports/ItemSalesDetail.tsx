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
  ToggleButton,
  ToggleButtonGroup,
  Card,
  CardContent,
  Grid,
  Divider,
} from '@mui/material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SyncIcon from '@mui/icons-material/Sync';
import { ItemStats, SaleRecord } from '../../types/staleItems';
import { getSalesForItem, formatCurrency, backfillSalesForItem } from '../../services/staleItems';

interface ItemSalesDetailProps {
  item: ItemStats;
  prototype?: 'A' | 'B' | 'C';
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#FFBB28'];

const ItemSalesDetail: React.FC<ItemSalesDetailProps> = ({ item, prototype: initialPrototype = 'A' }) => {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillAttempted, setBackfillAttempted] = useState(false);
  const [prototype, setPrototype] = useState<'A' | 'B' | 'C'>(initialPrototype);

  useEffect(() => {
    const fetchSales = async () => {
      setLoading(true);
      const salesData = await getSalesForItem(item.id);
      setSales(salesData);
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
    fetchSales();
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
  const sortedSales = [...sales].sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
  const salesWithCost = sortedSales.filter(sale => (sale.purchaseCost || 0) > 0);
  const chartData = salesWithCost.map((sale, index) => ({
      timestamp: new Date(sale.saleDate).getTime(),
      date: new Date(sale.saleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
      fullDate: new Date(sale.saleDate).toLocaleDateString(),
      salePrice: sale.salePrice || 0,
      cost: (sale.purchaseCost || 0) + (sale.shipCost || 0),
      profit: sale.profit || 0,
      margin: sale.profitMargin || 0,
      cumProfit: salesWithCost.slice(0, index + 1).reduce((sum, s) => sum + (s.profit || 0), 0),
      orderNumber: sale.orderNumber,
    }));

  // Get time domain for linear scale (extend to current date)
  const timeExtent = chartData.length > 0
    ? [chartData[0].timestamp, Date.now()]
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

  const handlePrototypeChange = (_: React.MouseEvent<HTMLElement>, newPrototype: 'A' | 'B' | 'C' | null) => {
    if (newPrototype) setPrototype(newPrototype);
  };

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

  // PROTOTYPE A: Timeline Focus - Emphasizes chronological progression
  const PrototypeA = () => (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>Prototype A: Timeline Focus</Typography>

      {/* Summary Stats Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={3}>
          <SummaryCard title="Total Sales" value={sales.length.toString()} subtitle={`${formatCurrency(totalRevenue)} revenue`} />
        </Grid>
        <Grid item xs={3}>
          <SummaryCard title="Total Profit" value={formatCurrency(totalProfit)} trend={totalProfit > 0 ? 'up' : 'down'} />
        </Grid>
        <Grid item xs={3}>
          <SummaryCard title="Avg Profit/Sale" value={formatCurrency(avgProfit)} />
        </Grid>
        <Grid item xs={3}>
          <SummaryCard title="Avg Margin" value={`${avgMargin.toFixed(1)}%`} trend={avgMargin > 30 ? 'up' : 'down'} />
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

      {/* Profit per Sale Line Chart */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Profit per Sale (Chronological)</Typography>
        <ResponsiveContainer width="100%" height={200}>
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
            <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }}
              labelFormatter={(ts) => new Date(ts).toLocaleDateString()}
              formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === 'profit' ? 'Profit' : 'Sale Price']}
            />
            <Line type="monotone" dataKey="profit" stroke="#8884d8" strokeWidth={2} dot={{ fill: '#8884d8', r: 4 }} />
            <Line type="monotone" dataKey="salePrice" stroke="#ffc658" strokeWidth={1} strokeDasharray="5 5" />
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

  // PROTOTYPE B: Analytics Dashboard - Multiple metrics at a glance
  const PrototypeB = () => (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>Prototype B: Analytics Dashboard</Typography>

      {/* Top Summary Stats */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={2}>
          <SummaryCard title="Sales" value={sales.length.toString()} />
        </Grid>
        <Grid item xs={2}>
          <SummaryCard title="Revenue" value={formatCurrency(totalRevenue)} />
        </Grid>
        <Grid item xs={2}>
          <SummaryCard title="Profit" value={formatCurrency(totalProfit)} trend={totalProfit > 0 ? 'up' : 'down'} />
        </Grid>
        <Grid item xs={2}>
          <SummaryCard title="Avg Profit" value={formatCurrency(avgProfit)} />
        </Grid>
        <Grid item xs={2}>
          <SummaryCard title="Margin" value={`${avgMargin.toFixed(1)}%`} />
        </Grid>
        <Grid item xs={2}>
          <SummaryCard title="Best Sale" value={formatCurrency(Math.max(...sales.map(s => s.profit || 0), 0))} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {/* Price vs Profit Scatter */}
        <Grid item xs={6}>
          <Paper sx={{ p: 2, height: 280 }}>
            <Typography variant="subtitle2" gutterBottom>Sale Price vs Profit (Correlation)</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="salePrice" name="Sale Price" stroke="#888" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <YAxis dataKey="profit" name="Profit" stroke="#888" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }}
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                />
                <Scatter data={chartData} fill="#8884d8" />
              </ScatterChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Profit Distribution Pie */}
        <Grid item xs={6}>
          <Paper sx={{ p: 2, height: 280 }}>
            <Typography variant="subtitle2" gutterBottom>Profit Distribution</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={profitRanges}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {profitRanges.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Monthly Sales Bar Chart */}
        <Grid item xs={6}>
          <Paper sx={{ p: 2, height: 280 }}>
            <Typography variant="subtitle2" gutterBottom>Monthly Sales Volume & Profit</Typography>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="month" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }} />
                <Legend />
                <Bar dataKey="sales" fill="#8884d8" name="# Sales" />
                <Bar dataKey="profit" fill="#82ca9d" name="Profit $" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Margin Trend */}
        <Grid item xs={6}>
          <Paper sx={{ p: 2, height: 280 }}>
            <Typography variant="subtitle2" gutterBottom>Profit Margin Trend</Typography>
            <ResponsiveContainer width="100%" height={220}>
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
                <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444' }}
                  labelFormatter={(ts) => new Date(ts).toLocaleDateString()}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Margin']}
                />
                <Line type="monotone" dataKey="margin" stroke="#ff7300" strokeWidth={2} dot={{ fill: '#ff7300', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Compact Table */}
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Recent Sales</Typography>
        <TableContainer sx={{ maxHeight: 200 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Profit</TableCell>
                <TableCell align="right">Margin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sales.slice(0, 5).map((sale, idx) => (
                <TableRow key={idx}>
                  <TableCell>{new Date(sale.saleDate).toLocaleDateString()}</TableCell>
                  <TableCell align="right">{formatCurrency(sale.salePrice || 0)}</TableCell>
                  <TableCell align="right" sx={{ color: (sale.profit || 0) >= 0 ? 'success.main' : 'error.main' }}>
                    {formatCurrency(sale.profit || 0)}
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

  // PROTOTYPE C: Compact Data-Dense View
  const PrototypeC = () => {
    // Calculate additional stats
    const minProfit = Math.min(...sales.map(s => s.profit || 0));
    const maxProfit = Math.max(...sales.map(s => s.profit || 0));
    const stdDev = Math.sqrt(
      sales.reduce((sum, s) => sum + Math.pow((s.profit || 0) - avgProfit, 2), 0) / sales.length
    );

    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Prototype C: Compact Data-Dense</Typography>

        <Grid container spacing={2}>
          {/* Left: Stats & Mini Charts */}
          <Grid item xs={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold">Key Metrics</Typography>
              <Divider sx={{ mb: 1 }} />

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: '0.85rem' }}>
                <Typography variant="body2" color="text.secondary">Total Sales:</Typography>
                <Typography variant="body2" fontWeight="bold">{sales.length}</Typography>

                <Typography variant="body2" color="text.secondary">Total Revenue:</Typography>
                <Typography variant="body2" fontWeight="bold">{formatCurrency(totalRevenue)}</Typography>

                <Typography variant="body2" color="text.secondary">Total Profit:</Typography>
                <Typography variant="body2" fontWeight="bold" color={totalProfit >= 0 ? 'success.main' : 'error.main'}>
                  {formatCurrency(totalProfit)}
                </Typography>

                <Typography variant="body2" color="text.secondary">Avg Profit:</Typography>
                <Typography variant="body2" fontWeight="bold">{formatCurrency(avgProfit)}</Typography>

                <Typography variant="body2" color="text.secondary">Avg Margin:</Typography>
                <Typography variant="body2" fontWeight="bold">{avgMargin.toFixed(1)}%</Typography>

                <Typography variant="body2" color="text.secondary">Min Profit:</Typography>
                <Typography variant="body2" color={minProfit >= 0 ? 'success.main' : 'error.main'}>
                  {formatCurrency(minProfit)}
                </Typography>

                <Typography variant="body2" color="text.secondary">Max Profit:</Typography>
                <Typography variant="body2" color="success.main">{formatCurrency(maxProfit)}</Typography>

                <Typography variant="body2" color="text.secondary">Std Dev:</Typography>
                <Typography variant="body2">{formatCurrency(stdDev)}</Typography>
              </Box>

              {/* Mini Sparkline */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">Profit Trend</Typography>
                <ResponsiveContainer width="100%" height={60}>
                  <AreaChart data={chartData}>
                    <XAxis dataKey="timestamp" type="number" scale="time" domain={timeExtent} hide />
                    <Area type="monotone" dataKey="profit" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>

              {/* Mini Bar */}
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Monthly Volume</Typography>
                <ResponsiveContainer width="100%" height={60}>
                  <BarChart data={monthlyChartData}>
                    <Bar dataKey="sales" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* Middle: Combined Chart */}
          <Grid item xs={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold">Price vs Profit Analysis</Typography>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="salePrice" stroke="#888" fontSize={10} tickFormatter={(v) => `$${v}`} />
                  <YAxis dataKey="profit" stroke="#888" fontSize={10} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444', fontSize: '12px' }}
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Scatter data={chartData} fill="#8884d8" />
                </ScatterChart>
              </ResponsiveContainer>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" gutterBottom fontWeight="bold">Cumulative Profit</Typography>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={chartData}>
                  <XAxis dataKey="timestamp" type="number" scale="time" domain={timeExtent} stroke="#888" fontSize={9} tick={false} />
                  <YAxis stroke="#888" fontSize={9} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #444', fontSize: '12px' }}
                    labelFormatter={(ts) => new Date(ts).toLocaleDateString()}
                  />
                  <Line type="monotone" dataKey="cumProfit" stroke="#82ca9d" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Right: Full Table */}
          <Grid item xs={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                Sales History ({sales.length})
              </Typography>
              <TableContainer sx={{ maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: 'background.paper', p: 0.5, fontSize: '0.75rem' }}>Date</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', p: 0.5, fontSize: '0.75rem' }} align="right">$</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', p: 0.5, fontSize: '0.75rem' }} align="right">Profit</TableCell>
                      <TableCell sx={{ bgcolor: 'background.paper', p: 0.5, fontSize: '0.75rem' }} align="right">%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sales.map((sale, idx) => (
                      <TableRow key={idx} sx={{ '& td': { p: 0.5, fontSize: '0.75rem' } }}>
                        <TableCell>{new Date(sale.saleDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</TableCell>
                        <TableCell align="right">${(sale.salePrice || 0).toFixed(0)}</TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: (sale.profit || 0) >= 0 ? 'success.main' : 'error.main',
                            fontWeight: 'bold'
                          }}
                        >
                          ${(sale.profit || 0).toFixed(0)}
                        </TableCell>
                        <TableCell align="right">{(sale.profitMargin || 0).toFixed(0)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  return (
    <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1 }}>
      {/* Prototype Selector */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography variant="body2" color="text.secondary">View:</Typography>
        <ToggleButtonGroup
          value={prototype}
          exclusive
          onChange={handlePrototypeChange}
          size="small"
        >
          <ToggleButton value="A">Timeline</ToggleButton>
          <ToggleButton value="B">Dashboard</ToggleButton>
          <ToggleButton value="C">Compact</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Full Item: {item.itemName}
        </Typography>
      </Box>

      {/* Render selected prototype */}
      {prototype === 'A' && <PrototypeA />}
      {prototype === 'B' && <PrototypeB />}
      {prototype === 'C' && <PrototypeC />}
    </Box>
  );
};

export default ItemSalesDetail;
