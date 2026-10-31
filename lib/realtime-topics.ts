// Channel names shared by the server (which sends) and the browser (which listens).
export const POS_TOPIC = "pos-orders";
export const POS_EVENT = "orders.changed";
export const orderTopic = (trackingToken: string) => `order-${trackingToken}`;
export const ORDER_EVENT = "order.updated";
