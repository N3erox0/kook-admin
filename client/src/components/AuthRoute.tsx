import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';

export default function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
