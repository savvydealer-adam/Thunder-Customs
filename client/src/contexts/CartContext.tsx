import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Product } from "@shared/schema";

export interface CartItemWithProduct {
  product: Product;
  quantity: number;
}

interface CartContextType {
  items: CartItemWithProduct[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  getCartCount: () => number;
  getTotalItems: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "thunder_customs_cart";

interface StoredCartItem {
  productId: number;
  quantity: number;
  product: Product;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemWithProduct[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredCartItem[] = JSON.parse(stored);
        const cartItems: CartItemWithProduct[] = parsed.map(item => ({
          product: item.product,
          quantity: item.quantity,
        }));
        setItems(cartItems);
      } catch (error) {
        console.error("Failed to parse cart from localStorage:", error);
        localStorage.removeItem(CART_STORAGE_KEY);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    const toStore: StoredCartItem[] = items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      product: item.product,
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(toStore));
  }, [items]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setItems(currentItems => {
      const existingItem = currentItems.find(
        item => item.product.id === product.id
      );

      if (existingItem) {
        return currentItems.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [...currentItems, { product, quantity }];
    });
  };

  const removeFromCart = (productId: number) => {
    setItems(currentItems =>
      currentItems.filter(item => item.product.id !== productId)
    );
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setItems(currentItems =>
      currentItems.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  };

  const getCartCount = () => {
    return items.length;
  };

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getCartCount,
        getTotalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
