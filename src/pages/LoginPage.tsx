
import React from "react";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";

const LoginPage = () => {
  const { loading } = useAuth();
  
  // This will only redirect if the user is authenticated AND on the login page
  useAuthRedirect("/chats", false);

  // Show nothing while checking authentication status
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-white/70">Checking authentication...</p>
      </div>
    );
  }

  // Only show login form if user is not logged in
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
