import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Product } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

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

interface StoredCartItem {
  productId: number;
  quantity: number;
}

function getStorageKey(userId: string | null): string {
  return userId ? `cart_${userId}` : 'cart_anonymous';
}

function getStoredItems(key: string): StoredCartItem[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function mergeStoredItems(base: StoredCartItem[], additions: StoredCartItem[]): StoredCartItem[] {
  const map = new Map<number, number>();
  for (const item of base) {
    map.set(item.productId, (map.get(item.productId) || 0) + item.quantity);
  }
  for (const item of additions) {
    map.set(item.productId, (map.get(item.productId) || 0) + item.quantity);
  }
  return Array.from(map.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}

async function fetchCartProducts(storedItems: StoredCartItem[]): Promise<CartItemWithProduct[]> {
  if (storedItems.length === 0) return [];
  const productIds = storedItems.map(item => item.productId);
  const res = await fetch('/api/products/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: productIds }),
  });
  if (!res.ok) throw new Error('Failed to fetch cart products');
  const freshProducts: Product[] = await res.json();
  const productMap = new Map(freshProducts.map(p => [p.id, p]));
  return storedItems
    .map(item => {
      const product = productMap.get(item.productId);
      if (!product) return null;
      return { product, quantity: item.quantity };
    })
    .filter((item): item is CartItemWithProduct => item !== null);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItemWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const skipSaveRef = useRef(false);

  const userId = user?.id ?? null;
  const storageKey = getStorageKey(userId);

  useEffect(() => {
    if (authLoading) return;

    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    const loadCart = async () => {
      setIsLoading(true);
      skipSaveRef.current = true;

      try {
        let storedItems: StoredCartItem[];

        if (prevUserId === undefined) {
          storedItems = getStoredItems(storageKey);
        } else if (prevUserId === null && userId !== null) {
          const anonItems = getStoredItems(getStorageKey(null));
          const userItems = getStoredItems(storageKey);
          storedItems = mergeStoredItems(userItems, anonItems);
          localStorage.setItem(storageKey, JSON.stringify(storedItems));
          localStorage.removeItem(getStorageKey(null));
        } else {
          storedItems = getStoredItems(storageKey);
        }

        const cartItems = await fetchCartProducts(storedItems);
        setItems(cartItems);
      } catch (error) {
        console.error("Failed to load cart:", error);
        localStorage.removeItem(storageKey);
        setItems([]);
      } finally {
        setIsLoading(false);
        skipSaveRef.current = false;
      }
    };

    loadCart();
  }, [userId, authLoading, storageKey]);

  useEffect(() => {
    if (skipSaveRef.current || authLoading) return;
    const toStore: StoredCartItem[] = items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
    }));
    localStorage.setItem(storageKey, JSON.stringify(toStore));
  }, [items, storageKey, authLoading]);

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
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
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setItems(currentItems =>
      currentItems.filter(item => item.product.id !== productId)
    );
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setItems(currentItems =>
      currentItems.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const getCartCount = useCallback(() => {
    return items.length;
  }, [items]);

  const getTotalItems = useCallback(() => {
    return items.reduce((total, item) => total + item.quantity, 0);
  }, [items]);

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
