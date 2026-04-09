// Ffads — App Provider (combines all context providers)
import React from 'react';
import { UserProvider } from './UserContext';
import { ProductProvider } from './ProductContext';

export function AppProvider({ children }) {
  return (
    <UserProvider>
      <ProductProvider>
        {children}
      </ProductProvider>
    </UserProvider>
  );
}
