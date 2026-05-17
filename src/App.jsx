/**
 * App.jsx — the root of the application.
 * Defines all routes. Protected routes require login + active trial/subscription.
 * The lazy() imports mean each page only loads when the user navigates to it (faster initial load).
 */
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoadingSpinner from './components/LoadingSpinner'
import AppLayout from './layouts/AppLayout'

// Auth pages — loaded immediately (users need these before logging in)
import SignupPage from './pages/auth/SignupPage'
import LoginPage from './pages/auth/LoginPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import OnboardingPage from './pages/auth/OnboardingPage'
import UpgradePage from './pages/auth/UpgradePage'
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage'

// App pages — lazy loaded so the bundle stays small
const DashboardPage    = lazy(() => import('./pages/dashboard/DashboardPage'))
const CompliancePage   = lazy(() => import('./pages/compliance/CompliancePage'))
const DocumentsPage    = lazy(() => import('./pages/documents/DocumentsPage'))
const StaffPage        = lazy(() => import('./pages/staff/StaffPage'))
const InsurancePage    = lazy(() => import('./pages/insurance/InsurancePage'))
const LocalPermitsPage = lazy(() => import('./pages/permits/LocalPermitsPage'))
const TtbPage          = lazy(() => import('./pages/ttb/TtbPage'))
const GrantsPage       = lazy(() => import('./pages/grants/GrantsPage'))
const AccountPage      = lazy(() => import('./pages/account/AccountPage'))
const HelpPage         = lazy(() => import('./pages/help/HelpPage'))
const AdminPage        = lazy(() => import('./pages/admin/AdminPage'))
const RecipesPage      = lazy(() => import('./pages/recipes/RecipesPage'))
const RecipeDetailPage = lazy(() => import('./pages/recipes/RecipeDetailPage'))
const InventoryPage    = lazy(() => import('./pages/inventory/InventoryPage'))
const BrewDayPage      = lazy(() => import('./pages/brewday/BrewDayPage'))
const BrewDayLogPage   = lazy(() => import('./pages/brewday/BrewDayLogPage'))

// Suspense fallback wraps all lazy pages — shows a spinner during code loading
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes — no login required */}
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

        {/* Protected routes — login + active trial/subscription required */}
        {/* All wrapped in AppLayout which renders the sidebar and top bar */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* /onboarding — first time after signup */}
          <Route path="onboarding" element={<OnboardingPage />} />

          {/* Default route → dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"  element={<DashboardPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="documents"  element={<DocumentsPage />} />
          <Route path="staff"      element={<StaffPage />} />
          <Route path="insurance"  element={<InsurancePage />} />
          <Route path="permits"    element={<LocalPermitsPage />} />
          <Route path="ttb"        element={<TtbPage />} />
          <Route path="grants"   element={<GrantsPage />} />
          <Route path="account"  element={<AccountPage />} />
          <Route path="help"     element={<HelpPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="brewday"     element={<BrewDayPage />} />
          <Route path="brewday/:id" element={<BrewDayLogPage />} />
          <Route path="recipes"  element={<RecipesPage />} />
          <Route path="recipes/:id" element={<RecipeDetailPage />} />

          {/* Admin-only route — only visible to VITE_ADMIN_EMAIL */}
          <Route
            path="admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch-all — redirect unknown URLs to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
