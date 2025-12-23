import React, { useEffect, useState } from 'react';
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
} from '@mui/material';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ItemReport as ItemReportType } from '../../types';

export const ItemReport: React.FC = () => {
  const [reports, setReports] = useState<ItemReportType[]>([]);
  const [filteredReports, setFilteredReports] = useState<ItemReportType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchItemSales = async () => {
      try {
        setLoading(true);
        setError(null);

        const ordersRef = collection(db, 'orders');
        const querySnapshot = await getDocs(ordersRef);
        const itemMap = new Map<string, number>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const item = data.item;
          
          if (item) {
            const currentCount = itemMap.get(item) || 0;
            itemMap.set(item, currentCount + 1);
          }
        });

        const reportData: ItemReportType[] = Array.from(itemMap.entries())
          .map(([item, totalSold]) => ({ item, totalSold }))
          .sort((a, b) => b.totalSold - a.totalSold);

        setReports(reportData);
        setFilteredReports(reportData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching item sales:', err);
        setError('Failed to load item sales data.');
        setLoading(false);
      }
    };

    fetchItemSales();
  }, []);

  useEffect(() => {
    const filtered = reports.filter(report =>
      report.item.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredReports(filtered);
  }, [searchTerm, reports]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Item Sales Report
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Total times each item has been sold (all time)
      </Typography>

      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search items..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mt: 2, mb: 3 }}
      />

      {filteredReports.length === 0 ? (
        <Alert severity="info">
          {searchTerm ? 'No items found matching your search.' : 'No item sales data found.'}
        </Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Showing {filteredReports.length} of {reports.length} items
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Total Sold</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredReports.map((report, index) => (
                  <TableRow key={index}>
                    <TableCell>{report.item}</TableCell>
                    <TableCell align="right">{report.totalSold}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
};