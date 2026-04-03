import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './page.config'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { canAccessAdminPage } from '@/lib/adminAccess';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AdminOnlyRoute = ({ user, pageName, children }) => {
  if (!canAccessAdminPage(user, pageName)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const protectedUserPages = new Set(["Packages", "Amenities", "BookingForm", "MyBookings", "ProfileSettings"]);
const guestOrRegularUserPages = new Set(["About", "Contact"]);

const UserOnlyRoute = ({ isAuthenticated, children }) => {
  const location = useLocation();

  if (!isAuthenticated) {
    const nextUrl = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/Login?next=${encodeURIComponent(nextUrl)}`} replace />;
  }

  return children;
};

const GuestOrRegularUserRoute = ({ user, children }) => {
  if (user?.role === 'admin' || user?.role === 'super_admin') {
    return <Navigate to="/AdminDashboard" replace />;
  }

  return children;
};

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            path.startsWith('Admin') ? (
              <AdminOnlyRoute user={user} pageName={path}>
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              </AdminOnlyRoute>
            ) : guestOrRegularUserPages.has(path) ? (
              <GuestOrRegularUserRoute user={user}>
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              </GuestOrRegularUserRoute>
            ) : protectedUserPages.has(path) ? (
              <UserOnlyRoute isAuthenticated={Boolean(user)}>
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              </UserOnlyRoute>
            ) : (
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            )
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
