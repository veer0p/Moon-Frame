import { useState, useEffect, useRef } from 'react';

function useInactivityTimer(elementRef, delay = 3000) {
    const [isInactive, setIsInactive] = useState(false);
    const timeoutRef = useRef(null);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        const resetTimer = () => {
            setIsInactive(false);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                setIsInactive(true);
            }, delay);
        };

        const handleActivity = () => {
            resetTimer();
        };

        // Start timer on mount
        resetTimer();

        element.addEventListener('mousemove', handleActivity);
        element.addEventListener('mouseenter', handleActivity);
        element.addEventListener('click', handleActivity);
        element.addEventListener('touchstart', handleActivity, { passive: true });
        element.addEventListener('pointermove', handleActivity, { passive: true });

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            element.removeEventListener('mousemove', handleActivity);
            element.removeEventListener('mouseenter', handleActivity);
            element.removeEventListener('click', handleActivity);
            element.removeEventListener('touchstart', handleActivity);
            element.removeEventListener('pointermove', handleActivity);
        };
    }, [elementRef, delay]);

    return { isInactive };
}

export default useInactivityTimer;
