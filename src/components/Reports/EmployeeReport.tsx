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
} from '@mui/material';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { EmployeeReport as EmployeeReportType } from '../../types';

export const EmployeeReport: React.FC = () => {
  const [reports, setReports] = useState<EmployeeReportType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEmployeePerformance = async () => {
      try {
        setLoading(true);
        setError(null);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

        const ordersRef = collection(db, 'orders');
        const q = query(
          ordersRef,
          where('paidDate', '>=', thirtyDaysAgoISO)
        );

        const querySnapshot = await getDocs(q);
        const employeeMap = new Map<string, number>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const employee = data.employee;
          
          // Only count if employee exists and is not 'n/a'
          if (employee && employee.trim() !== '' && employee.trim() !== 'n/a') {
            const currentCount = employeeMap.get(employee) || 0;
            employeeMap.set(employee, currentCount + 1);
          }
        });

        const reportData: EmployeeReportType[] = Array.from(employeeMap.entries())
          .map(([employee, orderCount]) => ({ employee, orderCount }))
          .sort((a, b) => b.orderCount - a.orderCount);

        setReports(reportData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching employee performance:', err);
        setError('Failed to load employee performance data.');
        setLoading(false);
      }
    };

    fetchEmployeePerformance();
  }, []);

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
        Employee Performance Report
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Total orders (including returns) completed in the last 30 days
      </Typography>

      {reports.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No employee activity found in the last 30 days.
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell align="right">Orders Completed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.employee}>
                  <TableCell>{report.employee.replace('@pardical.com', '')}</TableCell>
                  <TableCell align="right">{report.orderCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};