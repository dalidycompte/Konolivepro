import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { VideoCallProvider } from '@/contexts/VideoCallContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import FloatingVideoCall from '@/components/video/FloatingVideoCall';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { routes } from './routes';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <AuthProvider>
            <VideoCallProvider>
              <IntersectObserver />
              <RouteGuard>
                <ErrorBoundary>
                  <Routes>
                    {routes.map((route) => (
                      <Route key={route.path} path={route.path} element={route.element} />
                    ))}
                    <Route path="*" element={<Navigate to="/login" replace />} />
                  </Routes>
                </ErrorBoundary>
                <FloatingVideoCall />
              </RouteGuard>
              <Toaster />
            </VideoCallProvider>
          </AuthProvider>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
