import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Stack,
  Card,
  CardContent,
} from '@mui/material';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Customer, Order } from '../../types';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';

export const CustomerList: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryLimit, setQueryLimit] = useState<number>(100);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [processedEmails] = useState<Set<string>>(new Set());
  const [totalDocumentsProcessed, setTotalDocumentsProcessed] = useState(0);

  const parseName = (shipName?: string): { firstName: string; lastName: string } => {
    if (!shipName || shipName.trim() === '') {
      return { firstName: 'Unknown', lastName: '' };
    }

    const parts = shipName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  };

  const isAmazonSupplier = (supplier?: string): boolean => {
    if (!supplier) return false;
    return supplier.toLowerCase().includes('amazon');
  };

  const loadCustomers = async (reset: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const ordersRef = collection(db, 'orders');

      let q = query(
        ordersRef,
        where('buyerEmail', '>', '@members.ebay.com'),
        orderBy('buyerEmail'),
        limit(queryLimit)
      );

      if (!reset && lastDoc) {
        q = query(
          ordersRef,
          where('buyerEmail', '>', '@members.ebay.com'),
          orderBy('buyerEmail'),
          startAfter(lastDoc),
          limit(queryLimit)
        );
      }

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setHasMore(false);
        if (reset) {
          setCustomers([]);
        }
        return;
      }

      const customerMap = new Map<string, Customer>();

      if (!reset) {
        customers.forEach(customer => {
          customerMap.set(customer.email, customer);
        });
      }

      let newDocumentsProcessed = 0;
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Order;
        newDocumentsProcessed++;

        if (data.buyerEmail && data.buyerEmail.trim() !== '') {
          const email = data.buyerEmail.toLowerCase().trim();

          // Skip eBay member emails (additional client-side filter)
          if (email.includes('@members.ebay.com')) {
            return;
          }

          if (!processedEmails.has(email)) {
            processedEmails.add(email);

            const { firstName, lastName } = parseName(data.shipName);
            const existingCustomer = customerMap.get(email);

            if (existingCustomer) {
              existingCustomer.orderCount += 1;
              if (data.paidDate && data.paidDate > existingCustomer.lastOrderDate) {
                existingCustomer.lastOrderDate = data.paidDate;
              }
              if (data.paidDate && data.paidDate < existingCustomer.firstOrderDate) {
                existingCustomer.firstOrderDate = data.paidDate;
              }
              if (data.supplier && !existingCustomer.supplier) {
                existingCustomer.supplier = data.supplier;
                existingCustomer.isAmazonCustomer = isAmazonSupplier(data.supplier);
              }
            } else {
              const customer: Customer = {
                email,
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`.trim(),
                isAmazonCustomer: isAmazonSupplier(data.supplier),
                supplier: data.supplier,
                orderCount: 1,
                firstOrderDate: data.paidDate || '',
                lastOrderDate: data.paidDate || '',
              };
              customerMap.set(email, customer);
            }
          }
        }
      });

      const uniqueCustomers = Array.from(customerMap.values()).sort((a, b) =>
        a.email.localeCompare(b.email)
      );

      setCustomers(uniqueCustomers);
      setTotalDocumentsProcessed(reset ? newDocumentsProcessed : totalDocumentsProcessed + newDocumentsProcessed);
      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMore(querySnapshot.size === queryLimit);

    } catch (err) {
      console.error('Error fetching customers:', err);
      setError('Failed to load customer data. Please check your permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadInitial = () => {
    processedEmails.clear();
    setCustomers([]);
    setLastDoc(null);
    setHasMore(true);
    setTotalDocumentsProcessed(0);
    loadCustomers(true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadCustomers(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Email', 'First Name', 'Last Name', 'Full Name', 'Amazon Customer', 'Supplier', 'Order Count', 'First Order Date', 'Last Order Date'];

    const csvContent = [
      headers.join(','),
      ...customers.map(customer => [
        customer.email,
        customer.firstName,
        customer.lastName,
        customer.fullName,
        customer.isAmazonCustomer ? 'Yes' : 'No',
        customer.supplier || '',
        customer.orderCount,
        customer.firstOrderDate,
        customer.lastOrderDate,
      ].map(field => {
        const value = String(field);
        return value.includes(',') || value.includes('"') || value.includes('\n')
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Customers
        </Typography>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField
                label="Query Limit"
                type="number"
                value={queryLimit}
                onChange={(e) => setQueryLimit(Math.max(1, parseInt(e.target.value) || 100))}
                size="small"
                sx={{ width: 150 }}
                InputProps={{ inputProps: { min: 1, max: 1000 } }}
              />
              <Button
                variant="contained"
                onClick={handleLoadInitial}
                disabled={loading}
                startIcon={<RefreshIcon />}
              >
                Load Customers
              </Button>
              {customers.length > 0 && (
                <>
                  <Button
                    variant="outlined"
                    onClick={handleLoadMore}
                    disabled={loading || !hasMore}
                  >
                    Load More
                  </Button>
                  <Button
                    variant="outlined"
                    color="success"
                    onClick={exportToCSV}
                    startIcon={<DownloadIcon />}
                  >
                    Export CSV
                  </Button>
                </>
              )}
            </Stack>

            <Stack direction="row" spacing={2}>
              <Chip
                label={`Unique Customers: ${customers.length}`}
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`Documents Processed: ${totalDocumentsProcessed}`}
                variant="outlined"
              />
              {!hasMore && (
                <Chip
                  label="All available data loaded"
                  color="success"
                  variant="outlined"
                />
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && customers.length === 0 && !error && (
        <Alert severity="info">
          No customer data loaded. Click "Load Customers" to begin.
        </Alert>
      )}

      {customers.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>First Name</TableCell>
                <TableCell>Last Name</TableCell>
                <TableCell>Amazon Customer</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell align="right">Orders</TableCell>
                <TableCell>First Order</TableCell>
                <TableCell>Last Order</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.email}>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell>{customer.firstName}</TableCell>
                  <TableCell>{customer.lastName}</TableCell>
                  <TableCell>
                    {customer.isAmazonCustomer ? (
                      <Chip label="Yes" color="success" size="small" />
                    ) : (
                      <Chip label="No" variant="outlined" size="small" />
                    )}
                  </TableCell>
                  <TableCell>{customer.supplier || '-'}</TableCell>
                  <TableCell align="right">{customer.orderCount}</TableCell>
                  <TableCell>
                    {customer.firstOrderDate ? new Date(customer.firstOrderDate).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};