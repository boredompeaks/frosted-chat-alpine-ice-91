
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * A hook to handle auth-based redirects
 * Only redirects if explicitly needed (prevents unnecessary refreshes)
 */
export const useAuthRedirect = (
  redirectTo: string = "/chats",
  requireAuth: boolean = true
) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip redirection during loading state
    if (loading) return;
    
    const currentPath = location.pathname;
    
    // Only redirect authenticated users if they're on the login/register/index page
    // This prevents redirections when already in an authenticated area
    if (user && requireAuth && ["/", "/login", "/register"].includes(currentPath)) {
      navigate(redirectTo);
    }
    
    // Only redirect unauthenticated users if they're trying to access protected routes
    // and they're not already heading to an auth page
    if (!user && !requireAuth && !["/", "/login", "/register"].includes(currentPath)) {
      navigate("/login");
    }
  }, [user, loading, navigate, redirectTo, requireAuth, location.pathname]);
};
