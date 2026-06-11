/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { ThemeProvider } from './ThemeContext';
import Layout from './components/Layout';
import Login from './features/auth/Login';
import CongregantList from './features/congregants/CongregantList';
import CongregantDetails from './features/congregants/CongregantDetails';
import SelectCongregant from './features/congregants/SelectCongregant';
import AddCongregant from './features/congregants/AddCongregant';
import AddContribution from './features/finances/AddContribution';
import FinancesPage from './features/finances/FinancesPage';
import FinancialReportPage from './features/finances/FinancialReportPage';
import AnalyticsPage from './features/analytics/AnalyticsPage';
import PastorDashboard from './features/dashboard/PastorDashboard';
import ProfilePage from './features/profile/ProfilePage';
import ManageChurches from './features/churches/ManageChurches';
import ManageMhaziniPage from './features/profile/ManageMhaziniPage';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import ProtectedRoute from './components/ProtectedRoute';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  state = { hasError: false, error: null };
  constructor(props: { children: ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red' }}>
          <h1>Something went wrong.</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<PastorDashboard />} />
              <Route path="congregants" element={<CongregantList />} />
              <Route path="congregants/:id" element={<CongregantDetails />} />
              <Route path="select-congregant" element={<SelectCongregant />} />
              <Route path="record-contribution" element={
                <div className="p-4">
                  <AddContribution />
                </div>
              } />
              <Route path="finances" element={<FinancesPage />} />
              <Route path="financial-report" element={<FinancialReportPage />} />
              <Route path="reports" element={<AnalyticsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="churches" element={<ManageChurches />} />
              <Route path="manage-mhazini" element={<ManageMhaziniPage />} />
              <Route path="add" element={
                <div className="p-4">
                  <AddCongregant 
                    onAdded={() => window.history.back()} 
                  />
                </div>
              } />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
