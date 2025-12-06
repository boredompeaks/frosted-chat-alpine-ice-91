import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassContainer } from "@/components/ui/glassmorphism";
import { Lock, Unlock } from "lucide-react";

interface CalculatorShellProps {
  onUnlock: () => void;
  isUnlocked: boolean;
}

const UNLOCK_CODE = "1337"; // The secret code to unlock
const LONG_PRESS_DURATION = 1500; // 1.5 seconds
const MAX_DISPLAY_LENGTH = 12;

const CalculatorShell: React.FC<CalculatorShellProps> = ({
  onUnlock,
  isUnlocked,
}) => {
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [currentInput, setCurrentInput] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // Clear any timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  // First: Define ALL callback functions
  const clearDisplay = useCallback(() => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
    setCurrentInput("");
  }, []);

  const handleNumber = useCallback(
    (num: string) => {
      if (waitingForOperand) {
        setDisplay(num);
        setCurrentInput(num);
        setWaitingForOperand(false);
      } else {
        if (display.length < MAX_DISPLAY_LENGTH) {
          const newDisplay = display === "0" ? num : display + num;
          setDisplay(newDisplay);
          setCurrentInput(newDisplay);
        }
      }
    },
    [display, waitingForOperand],
  );

  const handleDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay("0.");
      setCurrentInput("0.");
      setWaitingForOperand(false);
    } else if (!display.includes(".")) {
      setDisplay(display + ".");
      setCurrentInput(display + ".");
    }
  }, [display, waitingForOperand]);

  const performCalculation = useCallback(
    (firstValue: number, secondValue: number, operation: string): number => {
      switch (operation) {
        case "+":
          return firstValue + secondValue;
        case "-":
          return firstValue - secondValue;
        case "×":
          return firstValue * secondValue;
        case "÷":
          return secondValue !== 0 ? firstValue / secondValue : 0;
        case "%":
          return (firstValue * secondValue) / 100;
        default:
          return secondValue;
      }
    },
    [],
  );

  const handleOperation = useCallback(
    (nextOperation: string) => {
      const inputValue = parseFloat(display);

      if (previousValue === null) {
        setPreviousValue(inputValue);
      } else if (operation) {
        const result = performCalculation(previousValue, inputValue, operation);
        setDisplay(String(result));
        setPreviousValue(result);
      }

      setWaitingForOperand(true);
      setOperation(nextOperation);
    },
    [display, operation, previousValue, performCalculation],
  );

  const handleEquals = useCallback(() => {
    const inputValue = parseFloat(display);

    if (previousValue !== null && operation) {
      const result = performCalculation(previousValue, inputValue, operation);
      setDisplay(String(result));
      setPreviousValue(null);
      setOperation(null);
      setWaitingForOperand(true);
      setCurrentInput(String(result));
    }
  }, [display, operation, previousValue, performCalculation]);

  const handleBackspace = useCallback(() => {
    if (display.length > 1 && display !== "0") {
      const newDisplay = display.slice(0, -1);
      setDisplay(newDisplay);
      setCurrentInput(newDisplay);
    } else {
      setDisplay("0");
      setCurrentInput("0");
    }
  }, [display]);

  const handlePercent = useCallback(() => {
    const value = parseFloat(display);
    const result = value / 100;
    setDisplay(String(result));
    setCurrentInput(String(result));
  }, [display]);

  // Long press handlers for equals button
  const handleLongPressStart = () => {
    setLongPressProgress(0);

    // Start progress animation
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);
      setLongPressProgress(progress);
    }, 16); // ~60fps

    longPressTimer.current = setTimeout(() => {
      checkUnlockCode();
      cleanupLongPress();
    }, LONG_PRESS_DURATION);
  };

  const handleLongPressEnd = () => {
    cleanupLongPress();
  };

  const cleanupLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setLongPressProgress(0);
  };

  const checkUnlockCode = () => {
    if (currentInput === UNLOCK_CODE || display === UNLOCK_CODE) {
      onUnlock();
    }
  };

  // Now: Define keyboard handler AFTER all functions
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const { key } = event;

      if (key >= "0" && key <= "9") {
        handleNumber(key);
      } else if (key === ".") {
        handleDecimal();
      } else if (key === "+" || key === "-") {
        handleOperation(key);
      } else if (key === "*") {
        handleOperation("×");
      } else if (key === "/") {
        handleOperation("÷");
      } else if (key === "Enter" || key === "=") {
        event.preventDefault(); // Prevent form submission
        handleEquals();
      } else if (key === "Backspace") {
        handleBackspace();
      } else if (key.toLowerCase() === "c" || key === "Escape") {
        clearDisplay();
      } else if (key === "%") {
        handlePercent();
      }
    },
    [
      display,
      waitingForOperand,
      operation,
      previousValue,
      currentInput,
      handleNumber,
      handleDecimal,
      handleOperation,
      handleEquals,
      handleBackspace,
      handlePercent,
      clearDisplay,
    ],
  );

  // Keyboard support - NOW all functions are defined
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const buttons = [
    {
      label: "C",
      type: "function",
      action: clearDisplay,
      span: 2,
      color: "red",
    },
    { label: "⌫", type: "function", action: handleBackspace, color: "orange" },
    {
      label: "÷",
      type: "operator",
      action: () => handleOperation("÷"),
      color: "blue",
    },

    { label: "7", type: "number", action: () => handleNumber("7") },
    { label: "8", type: "number", action: () => handleNumber("8") },
    { label: "9", type: "number", action: () => handleNumber("9") },
    {
      label: "×",
      type: "operator",
      action: () => handleOperation("×"),
      color: "blue",
    },

    { label: "4", type: "number", action: () => handleNumber("4") },
    { label: "5", type: "number", action: () => handleNumber("5") },
    { label: "6", type: "number", action: () => handleNumber("6") },
    {
      label: "-",
      type: "operator",
      action: () => handleOperation("-"),
      color: "blue",
    },

    { label: "1", type: "number", action: () => handleNumber("1") },
    { label: "2", type: "number", action: () => handleNumber("2") },
    { label: "3", type: "number", action: () => handleNumber("3") },
    {
      label: "+",
      type: "operator",
      action: () => handleOperation("+"),
      color: "blue",
    },

    { label: "%", type: "function", action: handlePercent },
    { label: "0", type: "number", action: () => handleNumber("0") },
    { label: ".", type: "function", action: handleDecimal },
    { label: "=", type: "equals", action: handleEquals, color: "green" },
  ];

  const getButtonColor = (color?: string) => {
    switch (color) {
      case "red":
        return "bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40";
      case "orange":
        return "bg-orange-500/20 hover:bg-orange-500/30 active:bg-orange-500/40";
      case "blue":
        return "bg-blue-500/20 hover:bg-blue-500/30 active:bg-blue-500/40";
      case "green":
        return "bg-green-500/20 hover:bg-green-500/30 active:bg-green-500/40";
      default:
        return "bg-white/10 hover:bg-white/20 active:bg-white/30";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GlassContainer className="w-full max-w-md p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Calculator</h1>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowHint(!showHint)}
              className="p-2 rounded-full glass transition-colors hover:bg-white/10"
            >
              {isUnlocked ? (
                <Unlock className="h-5 w-5 text-green-400" />
              ) : (
                <Lock className="h-5 w-5 text-gray-400" />
              )}
            </motion.button>
          </div>

          {/* Hint */}
          <AnimatePresence>
            {showHint && !isUnlocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 glass rounded-lg overflow-hidden"
              >
                <p className="text-xs text-white/70 text-center">
                  💡 Enter code and hold "=" for 1.5s to unlock
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Display */}
          <div className="glass rounded-2xl p-6 mb-6 min-h-[100px] flex flex-col justify-end overflow-hidden">
            {operation && previousValue !== null && (
              <div className="text-sm text-white/50 mb-1 truncate text-right">
                {previousValue} {operation}
              </div>
            )}
            <motion.div
              key={display}
              initial={{ scale: 0.95, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.1 }}
              className="text-4xl font-bold text-white text-right break-all"
            >
              {display}
            </motion.div>
          </div>

          {/* Buttons Grid */}
          <div className="grid grid-cols-4 gap-3">
            {buttons.map((button, index) => {
              const isEquals = button.type === "equals";
              const span = button.span || 1;

              return (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={button.action}
                  onMouseDown={isEquals ? handleLongPressStart : undefined}
                  onMouseUp={isEquals ? handleLongPressEnd : undefined}
                  onMouseLeave={isEquals ? handleLongPressEnd : undefined}
                  onTouchStart={isEquals ? handleLongPressStart : undefined}
                  onTouchEnd={isEquals ? handleLongPressEnd : undefined}
                  className={`
                    relative overflow-hidden
                    glass rounded-xl p-4 text-xl font-semibold text-white
                    transition-all duration-200
                    ${getButtonColor(button.color)}
                    ${span === 2 ? "col-span-2" : ""}
                  `}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                >
                  {/* Long press progress indicator */}
                  {isEquals && longPressProgress > 0 && (
                    <motion.div
                      className="absolute inset-0 bg-green-500/30"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: longPressProgress / 100 }}
                      style={{ transformOrigin: "left" }}
                      transition={{ duration: 0.05 }}
                    />
                  )}
                  <span className="relative z-10">{button.label}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-white/40">
              CalcIta v1.0 • Secure Messaging
            </p>
            {!isUnlocked && (
              <p className="text-xs text-white/30 mt-1">Hint: 1337 + hold =</p>
            )}
          </div>
        </motion.div>
      </GlassContainer>
    </div>
  );
};

export default CalculatorShell;
