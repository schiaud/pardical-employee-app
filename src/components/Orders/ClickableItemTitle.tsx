import React from 'react';
import { Typography } from '@mui/material';

interface ClickableItemTitleProps {
  itemName: string;
  onOpenProfile: () => void;
}

export const ClickableItemTitle: React.FC<ClickableItemTitleProps> = ({
  itemName,
  onOpenProfile,
}) => {
  return (
    <Typography
      onClick={(e) => {
        e.stopPropagation();
        onOpenProfile();
      }}
      sx={{
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
        '&:hover': {
          color: '#3b82f6',
          textDecoration: 'underline',
        },
        transition: 'color 0.15s ease',
      }}
    >
      {itemName}
    </Typography>
  );
};
