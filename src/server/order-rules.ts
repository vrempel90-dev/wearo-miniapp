import { OrderStatus } from "@prisma/client";
import { assert } from "./errors";
export const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  CANCELLED: [],
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"],
  RETURNED: [],
};
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: "BUYER" | "SELLER" | "ADMIN",
) {
  assert(transitions[from].includes(to), 409, "Недопустимый переход статуса");
  if (actor === "BUYER")
    assert(
      (to === "CANCELLED" && ["PENDING", "CONFIRMED"].includes(from)) ||
        (from === "DELIVERED" && to === "RETURN_REQUESTED"),
      403,
      "Покупатель не может изменить этот статус",
    );
  if (actor === "SELLER")
    assert(
      !["RETURN_REQUESTED", "RETURNED"].includes(to) &&
        from !== "RETURN_REQUESTED",
      403,
      "Возвраты рассматривает администратор",
    );
}
export function commission(totalMinor: number, rateBps: number) {
  assert(
    Number.isInteger(totalMinor) &&
      totalMinor > 0 &&
      totalMinor <= 2_000_000_000 &&
      Number.isInteger(rateBps) &&
      rateBps >= 0 &&
      rateBps <= 10000,
    400,
    "Некорректная сумма или комиссия",
  );
  const amountMinor = Math.round((totalMinor * rateBps) / 10000);
  return { rateBps, amountMinor, sellerNetMinor: totalMinor - amountMinor };
}
