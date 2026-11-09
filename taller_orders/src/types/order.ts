export interface RequestedOrderItem {
  productId: string;
  quantity: number;
}

export interface OrderItem extends RequestedOrderItem {
  name: string;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  orderId: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
