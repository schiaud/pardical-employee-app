import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AuthProvider } from './components/Auth/AuthContext';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { LoginPage } from './components/Auth/LoginPage';
import { Layout } from './components/Layout/Layout';
import { OrderList } from './components/Orders/OrderList';
import { EmployeeReport } from './components/Reports/EmployeeReport';
import { ItemReport } from './components/Reports/ItemReport';
import { StaleItemsReport } from './components/Reports/StaleItemsReport';
import { CustomerList } from './components/Customers/CustomerList';
import { ShipmentList } from './components/Shipments/ShipmentList';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#3b82f6',
    },
    secondary: {
      main: '#22c55e',
    },
    background: {
      default: '#0a0a0b',
      paper: '#18181b',
    },
    text: {
      primary: '#e4e4e7',
      secondary: '#a1a1aa',
    },
    divider: '#27272a',
    error: {
      main: '#dc2626',
    },
    warning: {
      main: '#f97316',
    },
    success: {
      main: '#22c55e',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#18181b',
          borderRadius: 8,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#27272a',
            borderRadius: 4,
            '& fieldset': {
              borderColor: '#3f3f46',
            },
            '&:hover fieldset': {
              borderColor: '#3b82f6',
            },
          },
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<OrderList />} />
              <Route path="reports/employees" element={<EmployeeReport />} />
              <Route path="reports/items" element={<ItemReport />} />
              <Route path="reports/stale" element={<StaleItemsReport />} />
              <Route path="customers" element={<CustomerList />} />
              <Route path="shipments" element={<ShipmentList />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
