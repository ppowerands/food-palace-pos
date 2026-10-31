-- Database-level protection for permanent records.
-- Run once after migrations (npm run db:guards). Safe to re-run.

CREATE OR REPLACE FUNCTION fp_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Records in "%" are permanent and cannot be deleted.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE OR REPLACE FUNCTION fp_block_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Records in "%" are append-only and cannot be edited.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE OR REPLACE FUNCTION fp_guard_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
     OR NEW."orderCode" IS DISTINCT FROM OLD."orderCode"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."deliveryFee" IS DISTINCT FROM OLD."deliveryFee"
     OR NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount"
     OR NEW."serviceChargeAmount" IS DISTINCT FROM OLD."serviceChargeAmount"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."total" IS DISTINCT FROM OLD."total" THEN
    RAISE EXCEPTION 'Order numbers, creation details and billed amounts are permanent. Use a refund or void to correct an order.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fp_guard_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."methodName" IS DISTINCT FROM OLD."methodName"
     OR NEW."processedById" IS DISTINCT FROM OLD."processedById"
     OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Payment amounts and details are permanent. Record a refund instead.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  -- No deleting or truncating permanent records
  FOREACH t IN ARRAY ARRAY['Order','OrderItem','OrderItemAddon','OrderStatusHistory','Payment','Refund','AuditLog','InventoryMovement'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS fp_no_delete ON %I', t);
    EXECUTE format('CREATE TRIGGER fp_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fp_block_delete()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS fp_no_truncate ON %I', t);
    EXECUTE format('CREATE TRIGGER fp_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION fp_block_delete()', t);
  END LOOP;

  -- Append-only tables: no edits at all
  FOREACH t IN ARRAY ARRAY['OrderItem','OrderItemAddon','OrderStatusHistory','AuditLog','InventoryMovement'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS fp_no_update ON %I', t);
    EXECUTE format('CREATE TRIGGER fp_no_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fp_block_update()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS fp_guard_order ON "Order";
CREATE TRIGGER fp_guard_order BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION fp_guard_order();

DROP TRIGGER IF EXISTS fp_guard_payment ON "Payment";
CREATE TRIGGER fp_guard_payment BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION fp_guard_payment();
