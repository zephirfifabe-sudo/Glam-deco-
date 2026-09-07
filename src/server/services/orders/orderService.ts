import * as orderRepo from "@/server/repositories/orders/orderRepository";

export async function getOrderById(id: string) {
  return orderRepo.findOrderById(id);
}
