'use client';
import { useEffect, useState } from 'react';
import { modifierKey } from './keyboard';
export function useModifierKey() {
   const [modifier, setModifier] = useState('Ctrl');
   useEffect(() => {
      setModifier(modifierKey(navigator.platform));
   }, []);
   return modifier;
}
