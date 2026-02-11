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
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "thunder_customs_cart";

interface StoredCartItem {
  productId: number;
  quantity: number;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load cart from localStorage on mount
  useEffect(() => {
    const loadCart = async () => {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (!stored) {
        setIsLoading(false);
        return;
      }
      
      try {
        const parsed: StoredCartItem[] = JSON.parse(stored);
        if (parsed.length === 0) {
          setIsLoading(false);
          return;
        }
        
        const productIds = parsed.map(item => item.productId);
        const res = await fetch('/api/products/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: productIds }),
        });
        
        if (!res.ok) throw new Error('Failed to fetch cart products');
        const freshProducts: Product[] = await res.json();
        
        const productMap = new Map(freshProducts.map(p => [p.id, p]));
        const cartItems: CartItemWithProduct[] = parsed
          .map(item => {
            const product = productMap.get(item.productId);
            if (!product) return null;
            return { product, quantity: item.quantity };
          })
          .filter((item): item is CartItemWithProduct => item !== null);
        
        setItems(cartItems);
      } catch (error) {
        console.error("Failed to load cart:", error);
        localStorage.removeItem(CART_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCart();
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    const toStore: StoredCartItem[] = items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
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
        isLoading,
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
