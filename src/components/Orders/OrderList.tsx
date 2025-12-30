import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Badge,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
import { StaleItemsWidget } from './StaleItemsWidget';
import { useAuth } from '../Auth/AuthContext';

type FilterType = 'new' | 'notShipped' | 'returns' | 'all60Days' | 'all' | 'myOrders';

export const OrderList: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('notShipped');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [counts, setCounts] = useState<Record<FilterType, number>>({
    new: 0,
    notShipped: 0,
    returns: 0,
    all60Days: 0,
    all: 0,
    myOrders: 0,
  });
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    setError(null);

    let q: Query<DocumentData>;
    const ordersRef = collection(db, 'orders');

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

        case 'returns':
          // Return orders
          q = query(ordersRef, where('status', '==', 'return'));
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
      all60Days: orders.length, // This would need proper filtering
      all: orders.length,
      myOrders: orders.filter(o => o.employee === user?.displayName).length,
    };
    setCounts(newCounts);
  }, [orders, user]);

  const filterButtons = [
    { key: 'new' as FilterType, label: 'New Orders' },
    { key: 'notShipped' as FilterType, label: 'Not Shipped' },
    { key: 'returns' as FilterType, label: 'Returns' },
    { key: 'myOrders' as FilterType, label: 'My Orders' },
    { key: 'all60Days' as FilterType, label: 'All (60 Days)' },
    { key: 'all' as FilterType, label: 'All Orders' },
  ];

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
              {counts[key] > 0 && (
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

        <Typography sx={{ color: '#71717a', fontSize: '13px' }}>
          Showing {orders.length} orders
        </Typography>
      </Box>

      <StaleItemsWidget />

      {orders.length === 0 ? (
        <Alert
          severity="info"
          sx={{
            backgroundColor: '#18181b',
            color: '#a1a1aa',
            border: '1px solid #27272a',
          }}
        >
          No orders found for the selected filter.
        </Alert>
      ) : (
        orders.map((order) => <OrderCard key={order.id} order={order} />)
      )}

      <CreateOrderDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </Container>
  );
};