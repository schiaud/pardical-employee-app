import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Badge,
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  Query,
  DocumentData,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Order } from '../../types';
import { OrderCard } from './OrderCard';
import { CreateOrderDialog } from './CreateOrderDialog';
import { useAuth } from '../Auth/AuthContext';

type FilterType = 'new' | 'notShipped' | 'returns' | 'all60Days' | 'all6Months' | 'all' | 'myOrders';

export const OrderList: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('notShipped');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [counts, setCounts] = useState<Record<FilterType, number>>({
    new: 0,
    notShipped: 0,
    returns: 0,
    all60Days: 0,
    all6Months: 0,
    all: 0,
    myOrders: 0,
  });
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    setError(null);

    const ordersRef = collection(db, 'orders');
    const returnsRef = collection(db, 'returns');

    // Special handling for returns filter - query both collections
    if (filter === 'returns') {
      let legacyOrders: Order[] = [];
      let returnsOrders: Order[] = [];

      const sortAndSetOrders = () => {
        const combined = [...legacyOrders, ...returnsOrders];
        combined.sort((a, b) => {
          const dateA = new Date(a.paidDate || 0);
          const dateB = new Date(b.paidDate || 0);
          return dateA.getTime() - dateB.getTime();
        });
        setOrders(combined);
        setLoading(false);
      };

      // Query 1: Legacy returns from orders collection (status = 'return')
      const legacyQuery = query(ordersRef, where('status', '==', 'return'));
      const unsubscribeLegacy = onSnapshot(
        legacyQuery,
        (snapshot) => {
          legacyOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _collection: 'orders' } as Order));
          sortAndSetOrders();
        },
        (err) => {
          console.error('Error fetching legacy returns:', err);
          setError('Failed to load returns. Please check your permissions.');
          setLoading(false);
        }
      );

      // Query 2: All documents from returns collection (excluding completed ones)
      const returnsQuery = query(returnsRef, where('status', '!=', 'return complete'));
      const unsubscribeReturns = onSnapshot(
        returnsQuery,
        (snapshot) => {
          returnsOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _collection: 'returns' } as Order));
          sortAndSetOrders();
        },
        (err) => {
          console.error('Error fetching returns collection:', err);
          // Don't set error for new collection - it might not exist yet
          sortAndSetOrders();
        }
      );

      return () => {
        unsubscribeLegacy();
        unsubscribeReturns();
      };
    }

    // Standard single-collection queries for other filters
    let q: Query<DocumentData>;

    try {
      switch (filter) {
        case 'new':
          // Orders without an assigned employee
          q = query(
            ordersRef,
            where('status', 'not-in', ['completed', 'shipped', 'return done', 'delivered', 'return complete'])
          );
          break;

        case 'notShipped':
          // Orders not shipped yet
          q = query(
            ordersRef,
            where('status', 'not-in', ['completed', 'shipped', 'return complete', 'return', 'delivered', 'return done'])
          );
          break;

        case 'all60Days':
          // Orders from last 60 days
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          q = query(
            ordersRef,
            where('paidDate', '>=', sixtyDaysAgo.toISOString())
          );
          break;

        case 'all6Months':
          // Orders from last 6 months
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
          q = query(
            ordersRef,
            where('paidDate', '>=', sixMonthsAgo.toISOString())
          );
          break;

        case 'myOrders':
          // Orders assigned to current user
          if (user?.displayName) {
            q = query(ordersRef, where('employee', '==', user.displayName));
          } else {
            q = query(ordersRef, where('employee', '==', 'none'));
          }
          break;

        case 'all':
        default:
          // All orders
          q = query(ordersRef);
          break;
      }

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const orderData: Order[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            orderData.push({
              id: doc.id,
              ...data,
            } as Order);
          });

          // Sort orders by paidDate
          orderData.sort((a, b) => {
            const dateA = new Date(a.paidDate || 0);
            const dateB = new Date(b.paidDate || 0);
            return dateA.getTime() - dateB.getTime();
          });

          // Filter for 'new' orders (without employee) after fetching
          let filteredData = orderData;
          if (filter === 'new') {
            filteredData = orderData.filter(order => !order.employee || order.employee.trim() === '' || order.employee.trim() === 'n/a');
          }

          setOrders(filteredData);
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching orders:', err);
          setError('Failed to load orders. Please check your permissions.');
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up query:', err);
      setError('Failed to set up order query.');
      setLoading(false);
    }
  }, [filter, user]);

  // Update counts when orders change
  useEffect(() => {
    // This is a simplified count update - in production you might want separate queries for accurate counts
    const newCounts: Record<FilterType, number> = {
      new: orders.filter(o => !o.employee || o.employee.trim() === '' || o.employee.trim() === 'n/a').length,
      notShipped: orders.filter(o => !['completed', 'shipped', 'delivered', 'return done'].includes(o.status)).length,
      returns: orders.filter(o => o.status === 'return').length,
      all60Days: orders.length,
      all6Months: orders.length,
      all: orders.length,
      myOrders: orders.filter(o => o.employee === user?.displayName).length,
    };
    setCounts(newCounts);
  }, [orders, user]);

  // Debounce search term - only update filtered results after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filterButtons = [
    { key: 'new' as FilterType, label: 'New Orders' },
    { key: 'notShipped' as FilterType, label: 'Not Shipped' },
    { key: 'returns' as FilterType, label: 'Returns' },
    { key: 'myOrders' as FilterType, label: 'My Orders' },
    { key: 'all60Days' as FilterType, label: 'All (60 Days)' },
    { key: 'all6Months' as FilterType, label: 'All (6 Months)' },
    { key: 'all' as FilterType, label: 'All Orders' },
  ];

  // Filter orders by search term across all visible fields
  const filterBySearch = (order: Order, term: string): boolean => {
    if (!term.trim()) return true;
    const lowerTerm = term.toLowerCase();
    const searchableFields = [
      order.orderNumber,
      order.item,
      order.buyerUsername,
      order.shipName,
      order.shipAddress,
      order.shipAddress2,
      order.shipCity,
      order.shipState,
      order.shipZip,
      order.tracking,
      order.carrier,
      order.supplier,
      order.supplierContact,
      order.employee,
      order.notes,
      order.buyPrice,
      order.shipPrice,
      order.earnings,
    ];
    return searchableFields.some(field =>
      field && String(field).toLowerCase().includes(lowerTerm)
    );
  };

  const filteredOrders = orders.filter(order => filterBySearch(order, debouncedSearchTerm));

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" disableGutters sx={{ mt: 4, px: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ mt: 2.5, mb: 4, px: 3 }}>
      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: '#fff',
              fontSize: '24px',
            }}
          >
            Orders
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{
              backgroundColor: '#22c55e',
              '&:hover': { backgroundColor: '#16a34a' },
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            Create New Order
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          {filterButtons.map(({ key, label }) => (
            <Button
              key={key}
              onClick={() => setFilter(key)}
              variant={filter === key ? 'contained' : 'outlined'}
              sx={{
                position: 'relative',
                fontSize: '12px',
                fontWeight: 500,
                px: 2,
                py: 0.75,
                borderColor: filter === key ? 'primary.main' : '#27272a',
                backgroundColor: filter === key ? 'primary.main' : 'transparent',
                color: filter === key ? '#fff' : '#a1a1aa',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: filter === key ? 'primary.dark' : 'rgba(59, 130, 246, 0.1)',
                },
              }}
            >
              {label}
              {counts[key] > 0 && !['all60Days', 'all6Months', 'all'].includes(key) && (
                <Badge
                  badgeContent={counts[key]}
                  color="error"
                  sx={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    '& .MuiBadge-badge': {
                      fontSize: '10px',
                      minWidth: '18px',
                      height: '18px',
                    },
                  }}
                />
              )}
            </Button>
          ))}
        </Box>

        <TextField
          placeholder="Search orders..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{
            mb: 1.5,
            maxWidth: 400,
            '& .MuiOutlinedInput-root': {
              backgroundColor: '#18181b',
              '& fieldset': { borderColor: '#27272a' },
              '&:hover fieldset': { borderColor: '#3f3f46' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
            },
            '& .MuiInputBase-input': {
              color: '#fff',
              fontSize: '14px',
              '&::placeholder': { color: '#71717a', opacity: 1 },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#71717a', fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => setSearchTerm('')}
                  sx={{ color: '#71717a', '&:hover': { color: '#a1a1aa' } }}
                >
                  <ClearIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Typography sx={{ color: '#71717a', fontSize: '13px' }}>
          {(() => {
            const total = filteredOrders.reduce((sum, order) => {
              const val = parseFloat(String(order.earnings || '0').replace(/[^0-9.-]/g, ''));
              return sum + (isNaN(val) ? 0 : val);
            }, 0);
            const totalStr = `$${total.toFixed(2)}`;
            return searchTerm
              ? `${filteredOrders.length} of ${orders.length} orders match "${searchTerm}": Total ${totalStr}`
              : `Showing ${filteredOrders.length} orders: Total ${totalStr}`;
          })()}
        </Typography>
      </Box>

      {filteredOrders.length === 0 ? (
        <Alert
          severity="info"
          sx={{
            backgroundColor: '#18181b',
            color: '#a1a1aa',
            border: '1px solid #27272a',
          }}
        >
          {searchTerm
            ? `No orders match "${searchTerm}"`
            : 'No orders found for the selected filter.'}
        </Alert>
      ) : (
        filteredOrders.map((order) => <OrderCard key={order.id} order={order} />)
      )}

      <CreateOrderDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </Container>
  );
};