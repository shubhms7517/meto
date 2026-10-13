import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Phone settings me "Remove animations" on ho to true — tab looping animations band rakhte hain
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}
