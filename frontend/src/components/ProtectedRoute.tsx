import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { user, loading, can } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Você não tem acesso a esta área.
      </div>
    );
  }
  return <>{children}</>;
}
