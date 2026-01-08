import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';

interface ReplacementDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (wantsReplacement: boolean) => void;
}

export const ReplacementDialog: React.FC<ReplacementDialogProps> = ({ open, onClose, onConfirm }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid #27272a', pb: 2 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '18px', color: '#fff' }}>
          Return Options
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ mt: 2, py: 3 }}>
        <Typography sx={{ color: '#a1a1aa', fontSize: '14px' }}>
          Would the customer like a replacement?
        </Typography>
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #27272a', p: 2, gap: 1 }}>
        <Button
          onClick={() => onConfirm(false)}
          variant="outlined"
          sx={{
            borderColor: '#27272a',
            color: '#a1a1aa',
            '&:hover': { borderColor: '#52525b' }
          }}
        >
          No, just return
        </Button>
        <Button
          onClick={() => onConfirm(true)}
          variant="contained"
          color="primary"
        >
          Yes, send replacement
        </Button>
      </DialogActions>
    </Dialog>
  );
};
