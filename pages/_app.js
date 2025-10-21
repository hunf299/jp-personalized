// pages/_app.js
import * as React from 'react';
import Head from 'next/head';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import Layout from '../components/Layout';
import { GlobalBusyProvider } from '../components/GlobalBusy';

// 🔽 THÊM DÒNG NÀY
import { PomodoroProvider } from '../lib/pomodoroStore';
import '../styles/globals.css';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#e57373' },
    secondary: { main: '#ff8a65' },
    success: { main: '#43a047' },
    warning: { main: '#ffa726' },
    info: { main: '#64b5f6' },
    error: { main: '#ef5350' },
  },
  typography: { fontFamily: `'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`, h5: { fontWeight: 700 } },
  components: {
    MuiContainer: {
      defaultProps: {
        maxWidth: 'md',
      },
    },
  },
});

export default function MyApp({ Component, pageProps }) {
  return (
      <>
        <Head><meta name="viewport" content="initial-scale=1, width=device-width" /></Head>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {/* 🔽 BỌC Provider Ở NGOÀI Layout ĐỂ Layout DÙNG usePomodoro */}
          <PomodoroProvider>
            <GlobalBusyProvider>
              <Layout>
                <Component {...pageProps} />
              </Layout>
            </GlobalBusyProvider>
          </PomodoroProvider>
        </ThemeProvider>
      </>
  );
}
