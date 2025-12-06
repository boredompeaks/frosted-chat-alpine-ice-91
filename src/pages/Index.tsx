
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CalculatorShell from "@/components/calculator/CalculatorShell";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    // If user is already authenticated, redirect to chats
    if (!loading && user) {
      navigate("/chats");
    }
  }, [user, loading, navigate]);

  const handleUnlock = () => {
    setIsUnlocked(true);
    // Add a small delay for the animation to complete if any
    setTimeout(() => {
      navigate("/login");
    }, 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        {/* Silent loading */}
      </div>
    );
  }
  
  // Render the decoy calculator
  return (
    <CalculatorShell 
      onUnlock={handleUnlock} 
      isUnlocked={isUnlocked} 
    />
  );
};

export default Index;
