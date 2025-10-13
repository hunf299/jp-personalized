// components/GlobalBusy.jsx
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { Backdrop, CircularProgress, Snackbar, Alert } from '@mui/material';

const BusyCtx = createContext(null);

export function GlobalBusyProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [snack, setSnack] = useState({ open:false, msg:'', severity:'success' });

  const start = useCallback((msg='Đang xử lý…') => {
    setOpen(true);
    if (msg) setSnack({ open:true, msg, severity:'info' });
  }, []);
  const finish = useCallback((msg='Hoàn tất!', severity='success') => {
    setOpen(false);
    if (msg) setSnack({ open:true, msg, severity });
  }, []);
  const value = useMemo(()=>({ start, finish }), [start, finish]);

  return (
      <BusyCtx.Provider value={value}>
        {children}
        <Backdrop open={open} sx={{ zIndex: (t)=>t.zIndex.drawer + 1000 }}>
          <CircularProgress />
        </Backdrop>
        <Snackbar
            anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
            open={snack.open}
            onClose={()=>setSnack(s=>({ ...s, open:false }))}
            autoHideDuration={2000}
        >
          <Alert severity={snack.severity} sx={{ width:'100%' }}>{snack.msg}</Alert>
        </Snackbar>
      </BusyCtx.Provider>
  );
}

export function useBusy() {
  const ctx = useContext(BusyCtx);
  if (!ctx) return { start: ()=>{}, finish: ()=>{} };
  return ctx;
}

export default function Layout({ children }) {
    // ...
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: focus ? '#fff' : 'linear-gradient(180deg,#f3e5f5 0%,#e1f5fe 100%)' }}>
            {/* AppBar ... */}
            <Box sx={{ maxWidth: 1040, mx: 'auto', px: 2, py: 3 }}>
                {/* Banner nhắc bật thông báo */}
                <NotifyBanner />
                {children}
            </Box>
        </Box>
    );
}
