import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useAuth } from '../Auth/AuthContext';
import { ShippingDialog } from '../Shipping/ShippingDialog';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [shippingDialogOpen, setShippingDialogOpen] = React.useState(false);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    handleClose();
  };

  const tabValue = location.pathname === '/reports/employees' ? 1 :
                   location.pathname === '/reports/items' ? 2 :
                   location.pathname === '/reports/stale' ? 3 :
                   location.pathname === '/customers' ? 4 : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar
        position="static"
        sx={{
          backgroundColor: '#18181b',
          borderBottom: '1px solid #27272a',
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important', px: 3 }}>
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 0,
              mr: 4,
              fontWeight: 700,
              fontSize: '18px',
              color: '#fff',
            }}
          >
            Pardical
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.5, flexGrow: 1 }}>
            {[
              { label: 'Orders', value: 0, path: '/' },
              { label: 'Reports', value: 1, path: '/reports/employees' },
              { label: 'Items', value: 2, path: '/reports/items' },
              { label: 'Stale', value: 3, path: '/reports/stale' },
              { label: 'Customers', value: 4, path: '/customers' },
            ].map((tab) => (
              <Button
                key={tab.value}
                onClick={() => navigate(tab.path)}
                sx={{
                  px: 2,
                  py: 0.75,
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: tabValue === tab.value ? '#fff' : '#a1a1aa',
                  backgroundColor: tabValue === tab.value ? '#3b82f6' : 'transparent',
                  '&:hover': {
                    backgroundColor: tabValue === tab.value ? '#3b82f6' : '#27272a',
                    color: '#fff',
                  },
                }}
              >
                {tab.label}
              </Button>
            ))}
            <Button
              onClick={() => setShippingDialogOpen(true)}
              startIcon={<LocalShippingIcon sx={{ fontSize: 16 }} />}
              sx={{
                px: 2,
                py: 0.75,
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                ml: 1,
                color: '#a1a1aa',
                backgroundColor: 'transparent',
                border: '1px solid #27272a',
                '&:hover': {
                  backgroundColor: '#27272a',
                  color: '#fff',
                },
              }}
            >
              Ship
            </Button>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: '13px', color: '#a1a1aa' }}>
              {user?.displayName || 'Unknown'}
            </Typography>
            <IconButton
              size="small"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              sx={{ p: 0 }}
            >
              <Avatar
                src={user?.photoURL || undefined}
                alt={user?.displayName || 'User'}
                sx={{ width: 28, height: 28 }}
              />
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              open={Boolean(anchorEl)}
              onClose={handleClose}
              sx={{
                '& .MuiPaper-root': {
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  mt: 1,
                },
              }}
            >
              <MenuItem
                onClick={handleLogout}
                sx={{
                  fontSize: '13px',
                  '&:hover': { backgroundColor: '#27272a' },
                }}
              >
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default' }}>
        <Outlet />
      </Box>

      <ShippingDialog
        open={shippingDialogOpen}
        onClose={() => setShippingDialogOpen(false)}
      />
    </Box>
  );
};