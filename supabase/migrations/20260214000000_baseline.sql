-- Baseline schema dump from production (2026-02-14)
-- Pure schema only — no org-specific data
-- Data seeding is handled by scripts/seed-demo.mjs

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."intake_channel" AS ENUM (
    'email',
    'sms',
    'whatsapp'
);


ALTER TYPE "public"."intake_channel" OWNER TO "postgres";


COMMENT ON TYPE "public"."intake_channel" IS 'Communication channel for intake events';



CREATE TYPE "public"."intake_event_type" AS ENUM (
    'new_order',
    'update_order',
    'cancel_order',
    'question',
    'other'
);


ALTER TYPE "public"."intake_event_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."intake_event_type" IS 'Classification of intake event';



CREATE TYPE "public"."intake_provider" AS ENUM (
    'gmail',
    'twilio',
    'whatsapp_business'
);


ALTER TYPE "public"."intake_provider" OWNER TO "postgres";


COMMENT ON TYPE "public"."intake_provider" IS 'Service provider for intake events';



CREATE TYPE "public"."order_event_type" AS ENUM (
    'created',
    'updated',
    'cancelled',
    'comment',
    'exported',
    'status_changed',
    'user_reviewed',
    'change_proposed',
    'change_accepted',
    'change_rejected',
    'erp_exported'
);


ALTER TYPE "public"."order_event_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."order_event_type" IS 'Order lifecycle events: created, updated, cancelled, comment, exported, status_changed, change_proposed, change_accepted, change_rejected, erp_exported';



CREATE TYPE "public"."order_status" AS ENUM (
    'pending_review',
    'ready',
    'pushed_to_erp',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."order_status" IS 'Order status flow';



CREATE TYPE "public"."source_channel_type" AS ENUM (
    'email',
    'sms',
    'erp'
);


ALTER TYPE "public"."source_channel_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."source_channel_type" IS 'Valid source channels for orders: email, sms, erp';



CREATE OR REPLACE FUNCTION "public"."calculate_order_accuracy_metrics"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_metrics jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_line_items', COUNT(*) FILTER (WHERE prediction_type = 'line_item'),
    'accurate_line_items', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND line_item_is_accurate = true),
    'inaccurate_line_items', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND line_item_is_accurate = false),
    'accuracy_pct', ROUND(
      100.0 * COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND line_item_is_accurate = true) /
      NULLIF(COUNT(*) FILTER (WHERE prediction_type = 'line_item'), 0),
      2
    ),
    'sku_errors', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND sku_is_accurate = false),
    'quantity_errors', COUNT(*) FILTER (WHERE prediction_type = 'line_item' AND quantity_is_accurate = false),
    'sku_only_errors', COUNT(*) FILTER (WHERE error_type = 'sku_wrong'),
    'quantity_only_errors', COUNT(*) FILTER (WHERE error_type = 'quantity_wrong'),
    'both_wrong_errors', COUNT(*) FILTER (WHERE error_type = 'both_wrong'),
    'customer_accurate', BOOL_OR(customer_is_accurate) FILTER (WHERE prediction_type = 'customer'),
    'has_been_reviewed', BOOL_OR(user_reviewed_at IS NOT NULL)
  )
  INTO v_metrics
  FROM ai_predictions
  WHERE order_id = p_order_id;

  RETURN COALESCE(v_metrics, '{}'::jsonb);
END;
$$;


ALTER FUNCTION "public"."calculate_order_accuracy_metrics"("p_order_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_order_accuracy_metrics"("p_order_id" "uuid") IS 'Calculate accuracy metrics for a specific order (used for analytics and order_events metadata)';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_oauth_states"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < now();
END $$;


ALTER FUNCTION "public"."cleanup_expired_oauth_states"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Insert order
  INSERT INTO orders (
    organization_id,
    customer_id,
    customer_name,
    customer_reference,
    status,
    delivery_date,
    origin_intake_event_id,
    total_amount,
    currency
  ) VALUES (
    p_organization_id,
    p_customer_id,
    p_customer_name,
    p_order_data->>'customer_reference',
    COALESCE((p_order_data->>'status')::order_status, 'pending_review'::order_status),
    (p_order_data->>'delivery_date')::date,
    p_intake_event_id,
    (p_order_data->>'total_amount')::numeric,
    COALESCE(p_order_data->>'currency', 'USD')
  )
  RETURNING id INTO v_order_id;

  -- Create order event
  INSERT INTO order_events (
    order_id,
    intake_event_id,
    type,
    metadata
  ) VALUES (
    v_order_id,
    p_intake_event_id,
    'created'::order_event_type,
    jsonb_build_object('source', 'intake_event')
  );

  -- NOTE: We no longer update intake_event with order_id or event_type
  -- intake_event is just raw data capture - analysis happens separately

  RETURN v_order_id;
END;
$$;


ALTER FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb") IS 'Atomically create order and link to intake event (intake_event remains unchanged as raw data)';



CREATE OR REPLACE FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb", "p_created_by_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Insert order
  INSERT INTO orders (
    organization_id,
    customer_id,
    customer_name,
    customer_reference,
    status,
    delivery_date,
    origin_intake_event_id,
    total_amount,
    currency,
    created_by_user_id
  ) VALUES (
    p_organization_id,
    p_customer_id,
    p_customer_name,
    p_order_data->>'customer_reference',
    COALESCE(p_order_data->>'status', 'pending_review'),
    (p_order_data->>'delivery_date')::timestamp with time zone,
    p_intake_event_id,
    COALESCE((p_order_data->>'total_amount')::numeric, 0),
    COALESCE(p_order_data->>'currency', 'USD'),
    p_created_by_user_id
  )
  RETURNING id INTO v_order_id;

  -- Update the intake_event to link to this order
  UPDATE intake_events
  SET order_id = v_order_id
  WHERE id = p_intake_event_id;

  RETURN v_order_id;
END;
$$;


ALTER FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb", "p_created_by_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_users"("org_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    uo.user_id,
    au.email::text,
    uo.role
  FROM user_organizations uo
  JOIN auth.users au ON au.id = uo.user_id
  WHERE uo.organization_id = org_id
  ORDER BY au.email;
END;
$$;


ALTER FUNCTION "public"."get_organization_users"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_organization_users"("org_id" "uuid") IS 'Returns users (id, email, role) for a given organization';



CREATE OR REPLACE FUNCTION "public"."get_organization_with_demo_fallback"("p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_log_reason" "text" DEFAULT 'auto'::"text") RETURNS TABLE("organization_id" "uuid", "user_id" "uuid", "is_demo_fallback" boolean, "log_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_is_demo boolean := false;
  v_log_id uuid;
  v_reason text;
BEGIN
  -- Try to find user by email first
  IF p_email IS NOT NULL THEN
    SELECT au.id INTO v_user_id
    FROM auth.users au
    WHERE LOWER(au.email) = LOWER(p_email)
    LIMIT 1;
  END IF;

  -- If not found by email, try phone
  IF v_user_id IS NULL AND p_phone IS NOT NULL THEN
    SELECT au.id INTO v_user_id
    FROM auth.users au
    WHERE au.phone = p_phone
       OR au.raw_user_meta_data->>'phone' = p_phone
    LIMIT 1;
  END IF;

  -- If user found, get their organization
  IF v_user_id IS NOT NULL THEN
    SELECT uo.organization_id INTO v_org_id
    FROM user_organizations uo
    WHERE uo.user_id = v_user_id
    LIMIT 1;

    -- User exists but has no org - use demo
    IF v_org_id IS NULL THEN
      v_is_demo := true;
      v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
      v_user_id := '00000000-0000-0000-0000-000000000002'::uuid;
      v_reason := 'user_has_no_org';
    END IF;
  ELSE
    -- No user found - use demo
    v_is_demo := true;
    v_org_id := '00000000-0000-0000-0000-000000000001'::uuid;
    v_user_id := '00000000-0000-0000-0000-000000000002'::uuid;
    v_reason := 'user_not_found';
  END IF;

  -- Log if this was a demo fallback
  IF v_is_demo THEN
    INSERT INTO demo_fallback_logs (original_email, original_phone, reason, metadata)
    VALUES (
      p_email,
      p_phone,
      COALESCE(v_reason, p_log_reason),
      jsonb_build_object(
        'timestamp', NOW(),
        'resolved_org_id', v_org_id,
        'resolved_user_id', v_user_id
      )
    )
    RETURNING id INTO v_log_id;

    RAISE NOTICE '[DEMO FALLBACK] Email: %, Phone: %, Reason: %, Log ID: %',
      COALESCE(p_email, 'N/A'),
      COALESCE(p_phone, 'N/A'),
      v_reason,
      v_log_id;
  END IF;

  RETURN QUERY SELECT v_org_id, v_user_id, v_is_demo, v_log_id;
END;
$$;


ALTER FUNCTION "public"."get_organization_with_demo_fallback"("p_email" "text", "p_phone" "text", "p_log_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_organization_with_demo_fallback"("p_email" "text", "p_phone" "text", "p_log_reason" "text") IS 'Looks up organization for a given email/phone. Falls back to demo organization if user not found. Logs all fallback events.';



CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("user_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  RETURN user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("user_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_id_by_email"("user_email" "text") IS 'Returns user ID for a given email address from auth.users';



CREATE OR REPLACE FUNCTION "public"."get_user_id_by_phone"("user_phone" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
  normalized_input text;
BEGIN
  -- Normalize input: remove +, spaces, dashes, parens
  normalized_input := regexp_replace(user_phone, '[^0-9]', '', 'g');

  -- Also try matching just the last 10 digits (US phone without country code)
  -- This handles cases where auth.users stores 7813540382 but Twilio sends +17813540382
  SELECT id INTO user_id
  FROM auth.users
  WHERE
    -- Exact match after stripping non-digits from both
    regexp_replace(phone, '[^0-9]', '', 'g') = normalized_input
    OR
    -- Match last 10 digits (handles +1 country code difference)
    RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = RIGHT(normalized_input, 10)
  LIMIT 1;

  RETURN user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id_by_phone"("user_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_id_by_phone"("user_phone" "text") IS 'Returns user ID for a given phone number from auth.users. Handles various phone formats by normalizing.';



CREATE OR REPLACE FUNCTION "public"."is_global_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get the email of the current authenticated user
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Check if this is the global admin email
  RETURN user_email = 'orders.frootful@gmail.com';
END;
$$;


ALTER FUNCTION "public"."is_global_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_global_admin"() IS 'Check if current user is the global admin (orders.frootful@gmail.com)';



CREATE OR REPLACE FUNCTION "public"."is_organization_admin"("check_user_id" "uuid", "check_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_id = check_user_id
    AND organization_id = check_org_id
    AND role IN ('admin', 'owner')
  );
END;
$$;


ALTER FUNCTION "public"."is_organization_admin"("check_user_id" "uuid", "check_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_organization_admin"("check_user_id" "uuid", "check_org_id" "uuid") IS 'Check if a user is an admin or owner of an organization (bypasses RLS)';



CREATE OR REPLACE FUNCTION "public"."update_ai_predictions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_predictions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_customers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_customers_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_email_orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_email_orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_emails_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_emails_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_gmail_watch_state_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_gmail_watch_state_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_intake_files_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_intake_files_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_item_variants_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_item_variants_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_items_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_lines_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_order_lines_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_organizations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_organizations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_organizations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_organizations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_waitlist_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_waitlist_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_analysis_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "analysis_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "raw_request" "jsonb",
    "raw_response" "jsonb",
    "parsed_result" "jsonb",
    "model_used" "text" DEFAULT 'gpt-4o'::"text",
    "tokens_used" integer,
    "processing_time_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_analysis_logs_analysis_type_check" CHECK (("analysis_type" = ANY (ARRAY['email'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."ai_analysis_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_line_id" "uuid",
    "prediction_type" "text" NOT NULL,
    "predicted_customer_id" "text",
    "predicted_customer_number" "text",
    "predicted_customer_name" "text",
    "actual_customer_id" "text",
    "actual_customer_number" "text",
    "actual_customer_name" "text",
    "customer_is_accurate" boolean,
    "predicted_sku" "text",
    "predicted_product_name" "text",
    "predicted_quantity" numeric(10,2),
    "actual_sku" "text",
    "actual_product_name" "text",
    "actual_quantity" numeric(10,2),
    "sku_is_accurate" boolean,
    "quantity_is_accurate" boolean,
    "line_item_is_accurate" boolean GENERATED ALWAYS AS (
CASE
    WHEN ("prediction_type" = 'line_item'::"text") THEN (("sku_is_accurate" = true) AND ("quantity_is_accurate" = true))
    ELSE NULL::boolean
END) STORED,
    "error_type" "text",
    "confidence_score" numeric(3,2),
    "model_version" "text",
    "model_provider" "text",
    "predicted_at" timestamp with time zone DEFAULT "now"(),
    "user_reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_predictions_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric))),
    CONSTRAINT "ai_predictions_error_type_check" CHECK (("error_type" = ANY (ARRAY['accurate'::"text", 'sku_wrong'::"text", 'quantity_wrong'::"text", 'both_wrong'::"text", 'customer_wrong'::"text"]))),
    CONSTRAINT "ai_predictions_prediction_type_check" CHECK (("prediction_type" = ANY (ARRAY['customer'::"text", 'line_item'::"text"]))),
    CONSTRAINT "customer_prediction_has_customer_data" CHECK ((("prediction_type" <> 'customer'::"text") OR (("predicted_customer_name" IS NOT NULL) AND ("actual_customer_name" IS NOT NULL)))),
    CONSTRAINT "line_item_prediction_has_line_data" CHECK ((("prediction_type" <> 'line_item'::"text") OR (("order_line_id" IS NOT NULL) AND ("predicted_sku" IS NOT NULL) AND ("predicted_quantity" IS NOT NULL) AND ("actual_sku" IS NOT NULL) AND ("actual_quantity" IS NOT NULL))))
);


ALTER TABLE "public"."ai_predictions" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_predictions" IS 'Tracks AI predictions and user corrections for ML training feedback. Separate from operational data for clean analytics.';



COMMENT ON COLUMN "public"."ai_predictions"."prediction_type" IS 'Type of prediction: customer (customer matching) or line_item (SKU and quantity)';



COMMENT ON COLUMN "public"."ai_predictions"."line_item_is_accurate" IS 'Computed column: true only if BOTH SKU and quantity are accurate';



COMMENT ON COLUMN "public"."ai_predictions"."error_type" IS 'Categorization: accurate, sku_wrong, quantity_wrong, both_wrong, customer_wrong';



COMMENT ON COLUMN "public"."ai_predictions"."confidence_score" IS 'AI model confidence (0.0 to 1.0)';



COMMENT ON COLUMN "public"."ai_predictions"."model_version" IS 'AI model version (e.g., gpt-4o-2024-08-06) for tracking improvements';



CREATE OR REPLACE VIEW "public"."auth_users" AS
 SELECT "users"."id",
    "users"."email",
    "users"."phone",
    "users"."created_at",
    "users"."updated_at"
   FROM "auth"."users";


ALTER TABLE "public"."auth_users" OWNER TO "postgres";


COMMENT ON VIEW "public"."auth_users" IS 'View to access auth.users from service role';



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."customers" IS 'Organization-specific customer contacts';



COMMENT ON COLUMN "public"."customers"."name" IS 'Customer contact name';



COMMENT ON COLUMN "public"."customers"."email" IS 'Customer email address';



COMMENT ON COLUMN "public"."customers"."phone" IS 'Customer phone number';



COMMENT ON COLUMN "public"."customers"."active" IS 'Whether customer is active';



CREATE TABLE IF NOT EXISTS "public"."demo_fallback_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_email" "text",
    "original_phone" "text",
    "intake_event_id" "uuid",
    "order_id" "uuid",
    "proposal_id" "uuid",
    "reason" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."demo_fallback_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."demo_fallback_logs" IS 'Logs all cases where an incoming message was routed to the demo organization due to unknown user/email';



CREATE TABLE IF NOT EXISTS "public"."demo_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."demo_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gmail_watch_state" (
    "user_id" "uuid" NOT NULL,
    "last_history_id" "text" NOT NULL,
    "watch_expiration" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gmail_watch_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intake_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "channel" "public"."intake_channel" NOT NULL,
    "provider" "public"."intake_provider" NOT NULL,
    "provider_message_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_content" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."intake_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."intake_events" IS 'Intake events from various channels (email, sms). Database webhook will be configured manually in Supabase dashboard.';



COMMENT ON COLUMN "public"."intake_events"."organization_id" IS 'Organization this event belongs to. NULL for unassigned/unmatched events.';



COMMENT ON COLUMN "public"."intake_events"."raw_content" IS 'Original raw message data (email headers, body, SMS payload, etc.)';



CREATE TABLE IF NOT EXISTS "public"."intake_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "intake_event_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "extension" "text",
    "mime_type" "text",
    "size_bytes" integer,
    "source" "text" NOT NULL,
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "storage_path" "text" NOT NULL,
    "processed_content" "jsonb" DEFAULT '{}'::"jsonb",
    "processing_status" "text" DEFAULT 'pending'::"text",
    "processing_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "intake_files_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."intake_files" OWNER TO "postgres";


COMMENT ON TABLE "public"."intake_files" IS 'Files associated with intake events (email attachments, etc.)';



COMMENT ON COLUMN "public"."intake_files"."source" IS 'Origin of the file: email, sms, upload, etc.';



COMMENT ON COLUMN "public"."intake_files"."source_metadata" IS 'Source-specific metadata (e.g., gmail_attachment_id)';



COMMENT ON COLUMN "public"."intake_files"."storage_path" IS 'Path in Supabase Storage: {org_id}/{intake_event_id}/{file_id}.{ext}';



COMMENT ON COLUMN "public"."intake_files"."processed_content" IS 'Results from file processors (e.g., llm_whisperer text extraction)';



COMMENT ON COLUMN "public"."intake_files"."processing_status" IS 'Status of file processing: pending, processing, completed, failed';



CREATE TABLE IF NOT EXISTS "public"."item_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "variant_name" "text" NOT NULL,
    "variant_code" "text",
    "active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."item_variants" OWNER TO "postgres";


COMMENT ON TABLE "public"."item_variants" IS 'Size/type variations for each item (e.g., Small Clamshell, Large Clamshell)';



COMMENT ON COLUMN "public"."item_variants"."variant_name" IS 'Human-readable variant name (e.g., "Small Clamshell")';



COMMENT ON COLUMN "public"."item_variants"."variant_code" IS 'Short code for UI display (e.g., "S", "L", "T20")';



COMMENT ON COLUMN "public"."item_variants"."sort_order" IS 'Display order for variants (lower numbers first)';



COMMENT ON COLUMN "public"."item_variants"."notes" IS 'Additional info like oz weight for Small/Large variants';



CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "notes" "text"
);


ALTER TABLE "public"."items" OWNER TO "postgres";


COMMENT ON TABLE "public"."items" IS 'Organization-specific product catalog with each size/variant as a separate item';



COMMENT ON COLUMN "public"."items"."sku" IS 'Unique SKU code per organization';



COMMENT ON COLUMN "public"."items"."category" IS 'Item category (e.g., Vegetables, Herbs, Roots, Fruits, Mushroom)';



COMMENT ON COLUMN "public"."items"."notes" IS 'Additional notes such as page reference (P.1, P.2, etc.)';



CREATE TABLE IF NOT EXISTS "public"."oauth_states" (
    "state" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'business_central'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval),
    CONSTRAINT "oauth_states_provider_check" CHECK (("provider" = ANY (ARRAY['business_central'::"text", 'dynamics_365'::"text"])))
);


ALTER TABLE "public"."oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_change_proposal_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "order_line_id" "uuid",
    "line_number" integer,
    "change_type" "text" NOT NULL,
    "item_id" "uuid",
    "item_name" "text" NOT NULL,
    "proposed_values" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_variant_id" "uuid",
    CONSTRAINT "order_change_proposal_lines_change_type_check" CHECK (("change_type" = ANY (ARRAY['add'::"text", 'remove'::"text", 'modify'::"text"])))
);


ALTER TABLE "public"."order_change_proposal_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_change_proposal_lines" IS 'Individual line changes (add/remove/modify)';



COMMENT ON COLUMN "public"."order_change_proposal_lines"."proposed_values" IS 'AI-proposed values for this line (NULL for remove)';



CREATE TABLE IF NOT EXISTS "public"."order_change_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "intake_event_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "tags" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "order_change_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."order_change_proposals" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_change_proposals" IS 'AI-proposed changes to existing orders';



COMMENT ON COLUMN "public"."order_change_proposals"."order_id" IS 'NULL for new order proposals, populated for change proposals to existing orders';



COMMENT ON COLUMN "public"."order_change_proposals"."status" IS 'Workflow: pending → accepted/rejected';



COMMENT ON COLUMN "public"."order_change_proposals"."notes" IS 'Notes about the proposal (e.g., rejection reason, re-analysis context)';



COMMENT ON COLUMN "public"."order_change_proposals"."tags" IS 'Flexible tags/metadata. Key-value object.';



CREATE TABLE IF NOT EXISTS "public"."order_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "intake_event_id" "uuid",
    "type" "public"."order_event_type" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_events" IS 'Timeline/audit trail of all events affecting an order';



COMMENT ON COLUMN "public"."order_events"."metadata" IS 'Event-specific data (changes, exports, etc.)';



CREATE TABLE IF NOT EXISTS "public"."order_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "line_number" integer NOT NULL,
    "item_id" "uuid",
    "product_name" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "item_variant_id" "uuid",
    CONSTRAINT "order_lines_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."order_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_lines" IS 'Individual line items for orders. Pricing determined dynamically from items table based on customer relationships.';



COMMENT ON COLUMN "public"."order_lines"."meta" IS 'AI metadata: confidence scores, alternatives, user corrections';



COMMENT ON COLUMN "public"."order_lines"."status" IS 'Soft delete: active or deleted';



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text",
    "customer_reference" "text",
    "status" "public"."order_status" DEFAULT 'pending_review'::"public"."order_status" NOT NULL,
    "requested_ship_date" "date",
    "delivery_date" "date",
    "total_amount" numeric,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "origin_intake_event_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "source_channel" "public"."source_channel_type" DEFAULT 'email'::"public"."source_channel_type",
    "created_by_user_id" "uuid"
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."orders" IS 'Canonical order headers - single source of truth for all orders';



COMMENT ON COLUMN "public"."orders"."customer_name" IS 'Denormalized snapshot of customer name at order creation';



COMMENT ON COLUMN "public"."orders"."customer_reference" IS 'Customer PO number, store reference, or other identifier';



COMMENT ON COLUMN "public"."orders"."origin_intake_event_id" IS 'The intake event that created this order (one intake event can create multiple orders)';



COMMENT ON COLUMN "public"."orders"."user_reviewed_at" IS 'Timestamp when user first reviewed/edited AI-generated order (critical for training data collection)';



COMMENT ON COLUMN "public"."orders"."reviewed_by" IS 'User who first reviewed the order';



COMMENT ON COLUMN "public"."orders"."source_channel" IS 'Source channel of the order (email, sms, file_upload, etc.) - denormalized from intake_events.channel';



COMMENT ON COLUMN "public"."orders"."created_by_user_id" IS 'The user who received and forwarded this order to Frootful';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Multi-tenant organizations/customers using the platform';



COMMENT ON COLUMN "public"."organizations"."settings" IS 'Flexible JSONB for BC integration config, email settings, etc.';



COMMENT ON COLUMN "public"."organizations"."active" IS 'Whether organization is active and can use the platform';



CREATE TABLE IF NOT EXISTS "public"."user_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_organizations_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."user_organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_organizations" IS 'Junction table linking users to organizations with roles';



COMMENT ON COLUMN "public"."user_organizations"."role" IS 'User role: owner (full access), admin (manage users/settings), member (basic access)';



CREATE TABLE IF NOT EXISTS "public"."user_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "encrypted_access_token" "text",
    "encrypted_refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "tenant_id" "text",
    "company_id" "text",
    "company_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "customer_pricing_group" "text",
    "organization_id" "uuid",
    CONSTRAINT "user_tokens_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'business_central'::"text", 'supabase_session'::"text"])))
);


ALTER TABLE "public"."user_tokens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_tokens"."customer_pricing_group" IS 'Customer pricing group ID for Business Central pricing calculations';



COMMENT ON COLUMN "public"."user_tokens"."organization_id" IS 'Organization these tokens are for (BC integration is org-specific)';



ALTER TABLE ONLY "public"."ai_analysis_logs"
    ADD CONSTRAINT "ai_analysis_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_predictions"
    ADD CONSTRAINT "ai_predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_organization_id_email_key" UNIQUE ("organization_id", "email");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_fallback_logs"
    ADD CONSTRAINT "demo_fallback_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_leads"
    ADD CONSTRAINT "demo_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gmail_watch_state"
    ADD CONSTRAINT "gmail_watch_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."intake_events"
    ADD CONSTRAINT "intake_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intake_events"
    ADD CONSTRAINT "intake_events_provider_provider_message_id_key" UNIQUE ("provider", "provider_message_id");



ALTER TABLE ONLY "public"."intake_files"
    ADD CONSTRAINT "intake_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_variants"
    ADD CONSTRAINT "item_variants_item_id_variant_name_key" UNIQUE ("item_id", "variant_name");



ALTER TABLE ONLY "public"."item_variants"
    ADD CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_organization_id_sku_key" UNIQUE ("organization_id", "sku");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("state");



ALTER TABLE ONLY "public"."order_change_proposal_lines"
    ADD CONSTRAINT "order_change_proposal_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_change_proposals"
    ADD CONSTRAINT "order_change_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_lines"
    ADD CONSTRAINT "order_lines_order_id_line_number_key" UNIQUE ("order_id", "line_number");



ALTER TABLE ONLY "public"."order_lines"
    ADD CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_user_id_provider_key" UNIQUE ("user_id", "provider");



CREATE INDEX "gmail_watch_state_user_id_idx" ON "public"."gmail_watch_state" USING "btree" ("user_id");



CREATE INDEX "idx_ai_analysis_logs_analysis_type" ON "public"."ai_analysis_logs" USING "btree" ("analysis_type");



CREATE INDEX "idx_ai_analysis_logs_created_at" ON "public"."ai_analysis_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_analysis_logs_source_id" ON "public"."ai_analysis_logs" USING "btree" ("source_id");



CREATE INDEX "idx_ai_analysis_logs_user_id" ON "public"."ai_analysis_logs" USING "btree" ("user_id");



CREATE INDEX "idx_ai_predictions_analytics" ON "public"."ai_predictions" USING "btree" ("prediction_type", "user_reviewed_at", "error_type") WHERE ("user_reviewed_at" IS NOT NULL);



CREATE INDEX "idx_ai_predictions_customer_accuracy" ON "public"."ai_predictions" USING "btree" ("customer_is_accurate") WHERE ("prediction_type" = 'customer'::"text");



CREATE INDEX "idx_ai_predictions_error_type" ON "public"."ai_predictions" USING "btree" ("error_type");



CREATE INDEX "idx_ai_predictions_line_accuracy" ON "public"."ai_predictions" USING "btree" ("line_item_is_accurate") WHERE ("prediction_type" = 'line_item'::"text");



CREATE INDEX "idx_ai_predictions_model_version" ON "public"."ai_predictions" USING "btree" ("model_version");



CREATE INDEX "idx_ai_predictions_order" ON "public"."ai_predictions" USING "btree" ("order_id");



CREATE INDEX "idx_ai_predictions_order_line" ON "public"."ai_predictions" USING "btree" ("order_line_id");



CREATE INDEX "idx_ai_predictions_reviewed" ON "public"."ai_predictions" USING "btree" ("user_reviewed_at") WHERE ("user_reviewed_at" IS NOT NULL);



CREATE INDEX "idx_ai_predictions_reviewed_by" ON "public"."ai_predictions" USING "btree" ("reviewed_by");



CREATE INDEX "idx_ai_predictions_type" ON "public"."ai_predictions" USING "btree" ("prediction_type");



CREATE INDEX "idx_change_proposals_order" ON "public"."order_change_proposals" USING "btree" ("order_id");



CREATE INDEX "idx_change_proposals_org" ON "public"."order_change_proposals" USING "btree" ("organization_id");



CREATE INDEX "idx_change_proposals_status" ON "public"."order_change_proposals" USING "btree" ("status");



CREATE INDEX "idx_customers_active" ON "public"."customers" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "idx_customers_email" ON "public"."customers" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_customers_organization_id" ON "public"."customers" USING "btree" ("organization_id");



CREATE INDEX "idx_demo_fallback_logs_created_at" ON "public"."demo_fallback_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_demo_fallback_logs_reason" ON "public"."demo_fallback_logs" USING "btree" ("reason");



CREATE INDEX "idx_demo_leads_created_at" ON "public"."demo_leads" USING "btree" ("created_at");



CREATE INDEX "idx_demo_leads_email" ON "public"."demo_leads" USING "btree" ("email");



CREATE INDEX "idx_intake_events_created_at" ON "public"."intake_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_intake_events_organization_id" ON "public"."intake_events" USING "btree" ("organization_id");



CREATE INDEX "idx_intake_events_provider_msg" ON "public"."intake_events" USING "btree" ("provider", "provider_message_id");



CREATE INDEX "idx_intake_files_created_at" ON "public"."intake_files" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_intake_files_intake_event_id" ON "public"."intake_files" USING "btree" ("intake_event_id");



CREATE INDEX "idx_intake_files_organization_id" ON "public"."intake_files" USING "btree" ("organization_id");



CREATE INDEX "idx_intake_files_processing_status" ON "public"."intake_files" USING "btree" ("processing_status");



CREATE INDEX "idx_item_variants_active" ON "public"."item_variants" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "idx_item_variants_item_id" ON "public"."item_variants" USING "btree" ("item_id");



CREATE INDEX "idx_item_variants_sort_order" ON "public"."item_variants" USING "btree" ("sort_order");



CREATE INDEX "idx_items_active" ON "public"."items" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "idx_items_category" ON "public"."items" USING "btree" ("category");



CREATE INDEX "idx_items_name" ON "public"."items" USING "btree" ("name");



CREATE INDEX "idx_items_notes" ON "public"."items" USING "btree" ("notes");



CREATE INDEX "idx_items_organization_id" ON "public"."items" USING "btree" ("organization_id");



CREATE INDEX "idx_items_sku" ON "public"."items" USING "btree" ("sku");



CREATE INDEX "idx_oauth_states_expires_at" ON "public"."oauth_states" USING "btree" ("expires_at");



CREATE INDEX "idx_oauth_states_user_id" ON "public"."oauth_states" USING "btree" ("user_id");



CREATE INDEX "idx_order_events_created_at" ON "public"."order_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_order_events_order_id" ON "public"."order_events" USING "btree" ("order_id");



CREATE INDEX "idx_order_lines_item_id" ON "public"."order_lines" USING "btree" ("item_id") WHERE ("item_id" IS NOT NULL);



CREATE INDEX "idx_order_lines_order_id" ON "public"."order_lines" USING "btree" ("order_id");



CREATE INDEX "idx_order_lines_status" ON "public"."order_lines" USING "btree" ("order_id", "status");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_created_by_user_id" ON "public"."orders" USING "btree" ("created_by_user_id");



CREATE INDEX "idx_orders_customer_id" ON "public"."orders" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "idx_orders_organization_id" ON "public"."orders" USING "btree" ("organization_id");



CREATE INDEX "idx_orders_reviewed_by" ON "public"."orders" USING "btree" ("reviewed_by");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_user_reviewed" ON "public"."orders" USING "btree" ("user_reviewed_at");



CREATE INDEX "idx_organizations_active" ON "public"."organizations" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "idx_proposal_lines_order_line" ON "public"."order_change_proposal_lines" USING "btree" ("order_line_id");



CREATE INDEX "idx_proposal_lines_proposal" ON "public"."order_change_proposal_lines" USING "btree" ("proposal_id");



CREATE INDEX "idx_user_organizations_organization_id" ON "public"."user_organizations" USING "btree" ("organization_id");



CREATE INDEX "idx_user_organizations_role" ON "public"."user_organizations" USING "btree" ("role");



CREATE INDEX "idx_user_organizations_user_id" ON "public"."user_organizations" USING "btree" ("user_id");



CREATE INDEX "idx_user_tokens_expires_at" ON "public"."user_tokens" USING "btree" ("token_expires_at");



CREATE INDEX "idx_user_tokens_organization_id" ON "public"."user_tokens" USING "btree" ("organization_id");



CREATE INDEX "idx_user_tokens_provider" ON "public"."user_tokens" USING "btree" ("provider");



CREATE INDEX "idx_user_tokens_user_id" ON "public"."user_tokens" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "ai_predictions_updated_at" BEFORE UPDATE ON "public"."ai_predictions" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_predictions_updated_at"();



CREATE OR REPLACE TRIGGER "customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_customers_updated_at"();



CREATE OR REPLACE TRIGGER "gmail_watch_state_updated_at" BEFORE UPDATE ON "public"."gmail_watch_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_gmail_watch_state_updated_at"();



CREATE OR REPLACE TRIGGER "intake_files_updated_at" BEFORE UPDATE ON "public"."intake_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_intake_files_updated_at"();



CREATE OR REPLACE TRIGGER "item_variants_updated_at" BEFORE UPDATE ON "public"."item_variants" FOR EACH ROW EXECUTE FUNCTION "public"."update_item_variants_updated_at"();



CREATE OR REPLACE TRIGGER "items_updated_at" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."update_items_updated_at"();



CREATE OR REPLACE TRIGGER "order_lines_updated_at" BEFORE UPDATE ON "public"."order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."update_order_lines_updated_at"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_orders_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_organizations_updated_at"();



-- NOTE: The "process-intake-event" webhook trigger is created via Supabase Dashboard,
-- not via migrations. It references supabase_functions.http_request and environment-specific
-- URLs/keys. Set it up per-environment in Dashboard > Database > Webhooks.



CREATE OR REPLACE TRIGGER "update_user_tokens_updated_at" BEFORE UPDATE ON "public"."user_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "user_organizations_updated_at" BEFORE UPDATE ON "public"."user_organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_organizations_updated_at"();



ALTER TABLE ONLY "public"."ai_analysis_logs"
    ADD CONSTRAINT "ai_analysis_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_predictions"
    ADD CONSTRAINT "ai_predictions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_predictions"
    ADD CONSTRAINT "ai_predictions_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_predictions"
    ADD CONSTRAINT "ai_predictions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."demo_fallback_logs"
    ADD CONSTRAINT "demo_fallback_logs_intake_event_id_fkey" FOREIGN KEY ("intake_event_id") REFERENCES "public"."intake_events"("id");



ALTER TABLE ONLY "public"."demo_fallback_logs"
    ADD CONSTRAINT "demo_fallback_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."demo_fallback_logs"
    ADD CONSTRAINT "demo_fallback_logs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_change_proposals"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "fk_orders_origin_intake_event" FOREIGN KEY ("origin_intake_event_id") REFERENCES "public"."intake_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gmail_watch_state"
    ADD CONSTRAINT "gmail_watch_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intake_events"
    ADD CONSTRAINT "intake_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intake_files"
    ADD CONSTRAINT "intake_files_intake_event_id_fkey" FOREIGN KEY ("intake_event_id") REFERENCES "public"."intake_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intake_files"
    ADD CONSTRAINT "intake_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_variants"
    ADD CONSTRAINT "item_variants_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_change_proposal_lines"
    ADD CONSTRAINT "order_change_proposal_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_change_proposal_lines"
    ADD CONSTRAINT "order_change_proposal_lines_item_variant_id_fkey" FOREIGN KEY ("item_variant_id") REFERENCES "public"."item_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_change_proposal_lines"
    ADD CONSTRAINT "order_change_proposal_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_change_proposal_lines"
    ADD CONSTRAINT "order_change_proposal_lines_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_change_proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_change_proposals"
    ADD CONSTRAINT "order_change_proposals_intake_event_id_fkey" FOREIGN KEY ("intake_event_id") REFERENCES "public"."intake_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_change_proposals"
    ADD CONSTRAINT "order_change_proposals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_change_proposals"
    ADD CONSTRAINT "order_change_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_change_proposals"
    ADD CONSTRAINT "order_change_proposals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_intake_event_id_fkey" FOREIGN KEY ("intake_event_id") REFERENCES "public"."intake_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_lines"
    ADD CONSTRAINT "order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_lines"
    ADD CONSTRAINT "order_lines_item_variant_id_fkey" FOREIGN KEY ("item_variant_id") REFERENCES "public"."item_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_lines"
    ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can create order lines for any organization" ON "public"."order_lines" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = 'orders.frootful@gmail.com'::"text"));



CREATE POLICY "Admin can create orders for any organization" ON "public"."orders" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = 'orders.frootful@gmail.com'::"text"));



CREATE POLICY "Admin can read all order lines" ON "public"."order_lines" FOR SELECT USING ((("auth"."jwt"() ->> 'email'::"text") = 'orders.frootful@gmail.com'::"text"));



CREATE POLICY "Admin can read all orders" ON "public"."orders" FOR SELECT USING ((("auth"."jwt"() ->> 'email'::"text") = 'orders.frootful@gmail.com'::"text"));



CREATE POLICY "Admin can update order lines for any organization" ON "public"."order_lines" FOR UPDATE USING ((("auth"."jwt"() ->> 'email'::"text") = 'orders.frootful@gmail.com'::"text"));



CREATE POLICY "Admin can update orders for any organization" ON "public"."orders" FOR UPDATE USING ((("auth"."jwt"() ->> 'email'::"text") = 'orders.frootful@gmail.com'::"text"));



CREATE POLICY "Admins can manage customers in their organizations" ON "public"."customers" USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations"
  WHERE (("user_organizations"."organization_id" = "customers"."organization_id") AND ("user_organizations"."user_id" = "auth"."uid"()) AND ("user_organizations"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "Admins can manage items in their organizations" ON "public"."items" USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations"
  WHERE (("user_organizations"."organization_id" = "items"."organization_id") AND ("user_organizations"."user_id" = "auth"."uid"()) AND ("user_organizations"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "Admins can manage variants in their organizations" ON "public"."item_variants" USING ((EXISTS ( SELECT 1
   FROM ("public"."items"
     JOIN "public"."user_organizations" ON (("user_organizations"."organization_id" = "items"."organization_id")))
  WHERE (("items"."id" = "item_variants"."item_id") AND ("user_organizations"."user_id" = "auth"."uid"()) AND ("user_organizations"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "Allow public insert for demo organization order_events" ON "public"."order_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_events"."order_id") AND ("orders"."organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid")))));



CREATE POLICY "Allow public insert for demo organization order_lines" ON "public"."order_lines" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_lines"."order_id") AND ("orders"."organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid")))));



CREATE POLICY "Allow public insert for demo organization orders" ON "public"."orders" FOR INSERT WITH CHECK (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public read for demo organization customers" ON "public"."customers" FOR SELECT USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public read for demo organization intake_events" ON "public"."intake_events" FOR SELECT USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public read for demo organization items" ON "public"."items" FOR SELECT USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public read for demo organization order_events" ON "public"."order_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_events"."order_id") AND ("orders"."organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid")))));



CREATE POLICY "Allow public read for demo organization order_lines" ON "public"."order_lines" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_lines"."order_id") AND ("orders"."organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid")))));



CREATE POLICY "Allow public read for demo organization orders" ON "public"."orders" FOR SELECT USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public read for demo organization proposal_lines" ON "public"."order_change_proposal_lines" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."order_change_proposals"
  WHERE (("order_change_proposals"."id" = "order_change_proposal_lines"."proposal_id") AND ("order_change_proposals"."organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid")))));



CREATE POLICY "Allow public read for demo organization proposals" ON "public"."order_change_proposals" FOR SELECT USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public update for demo organization order_lines" ON "public"."order_lines" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_lines"."order_id") AND ("orders"."organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid")))));



CREATE POLICY "Allow public update for demo organization orders" ON "public"."orders" FOR UPDATE USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Allow public update for demo organization proposals" ON "public"."order_change_proposals" FOR UPDATE USING (("organization_id" = '00000000-0000-0000-0000-000000000001'::"uuid"));



CREATE POLICY "Anyone can insert demo leads" ON "public"."demo_leads" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Authenticated users can read all demo leads" ON "public"."demo_leads" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Global admin can delete proposal lines" ON "public"."order_change_proposal_lines" FOR DELETE USING ("public"."is_global_admin"());



CREATE POLICY "Global admin can delete proposals" ON "public"."order_change_proposals" FOR DELETE USING ("public"."is_global_admin"());



CREATE POLICY "Owners and admins can manage memberships" ON "public"."user_organizations" USING ("public"."is_organization_admin"("auth"."uid"(), "organization_id"));



CREATE POLICY "Public can read demo_fallback_logs" ON "public"."demo_fallback_logs" FOR SELECT USING (true);



CREATE POLICY "Service role can manage all AI analysis logs" ON "public"."ai_analysis_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage all customers" ON "public"."customers" USING (true);



CREATE POLICY "Service role can manage all files" ON "public"."intake_files" USING (true);



CREATE POLICY "Service role can manage all items" ON "public"."items" USING (true);



CREATE POLICY "Service role can manage all memberships" ON "public"."user_organizations" USING (true);



CREATE POLICY "Service role can manage all order events" ON "public"."order_events" USING (true);



CREATE POLICY "Service role can manage all organizations" ON "public"."organizations" USING (true);



CREATE POLICY "Service role can manage all variants" ON "public"."item_variants" USING (true);



CREATE POLICY "Service role can manage demo_fallback_logs" ON "public"."demo_fallback_logs" USING (true);



CREATE POLICY "Service role can manage watch states" ON "public"."gmail_watch_state" USING (true);



CREATE POLICY "Service role has full access" ON "public"."ai_predictions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can create order lines in their organization" ON "public"."order_lines" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_lines"."order_id") AND ("orders"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can create orders in their organization" ON "public"."orders" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create proposal lines in their organization" ON "public"."order_change_proposal_lines" FOR INSERT WITH CHECK (("public"."is_global_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."order_change_proposals"
  WHERE (("order_change_proposals"."id" = "order_change_proposal_lines"."proposal_id") AND ("order_change_proposals"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Users can create proposals in their organization" ON "public"."order_change_proposals" FOR INSERT WITH CHECK (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own tokens" ON "public"."user_tokens" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own tokens" ON "public"."user_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage tokens in their organizations" ON "public"."user_tokens" USING (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read customers from their organizations" ON "public"."customers" FOR SELECT USING (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read files from their organizations" ON "public"."intake_files" FOR SELECT USING (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read intake events from their organization" ON "public"."intake_events" FOR SELECT USING (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read items from their organizations" ON "public"."items" FOR SELECT USING (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read order events from their organization" ON "public"."order_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_events"."order_id") AND ("orders"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can read order lines from their organization" ON "public"."order_lines" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_lines"."order_id") AND ("orders"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can read orders from their organization" ON "public"."orders" FOR SELECT USING (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read own AI analysis logs" ON "public"."ai_analysis_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own organization memberships" ON "public"."user_organizations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own tokens" ON "public"."user_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own watch state" ON "public"."gmail_watch_state" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read proposal lines from their organization" ON "public"."order_change_proposal_lines" FOR SELECT USING (("public"."is_global_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."order_change_proposals"
  WHERE (("order_change_proposals"."id" = "order_change_proposal_lines"."proposal_id") AND ("order_change_proposals"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Users can read proposals from their organization" ON "public"."order_change_proposals" FOR SELECT USING (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read their organization customers" ON "public"."customers" FOR SELECT USING (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read their organizations" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations"
  WHERE (("user_organizations"."organization_id" = "organizations"."id") AND ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read tokens from their organizations" ON "public"."user_tokens" FOR SELECT USING (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read unassigned intake events" ON "public"."intake_events" FOR SELECT USING (("organization_id" IS NULL));



CREATE POLICY "Users can read variants from their organizations" ON "public"."item_variants" FOR SELECT USING (("public"."is_global_admin"() OR ("item_id" IN ( SELECT "items"."id"
   FROM ("public"."items"
     JOIN "public"."user_organizations" ON (("user_organizations"."organization_id" = "items"."organization_id")))
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update intake events in their organization" ON "public"."intake_events" FOR UPDATE USING (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))) OR ("organization_id" IS NULL))) WITH CHECK (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update order lines in their organization" ON "public"."order_lines" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_lines"."order_id") AND ("orders"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can update orders in their organization" ON "public"."orders" FOR UPDATE USING (("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update own tokens" ON "public"."user_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update proposal lines in their organization" ON "public"."order_change_proposal_lines" FOR UPDATE USING (("public"."is_global_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."order_change_proposals"
  WHERE (("order_change_proposals"."id" = "order_change_proposal_lines"."proposal_id") AND ("order_change_proposals"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Users can update proposals in their organization" ON "public"."order_change_proposals" FOR UPDATE USING (("public"."is_global_admin"() OR ("organization_id" IN ( SELECT "user_organizations"."organization_id"
   FROM "public"."user_organizations"
  WHERE ("user_organizations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view predictions for their org's orders" ON "public"."ai_predictions" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."organization_id" IN ( SELECT "user_organizations"."organization_id"
           FROM "public"."user_organizations"
          WHERE ("user_organizations"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."ai_analysis_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_predictions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demo_fallback_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demo_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gmail_watch_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intake_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intake_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_change_proposal_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_change_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tokens" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_order_accuracy_metrics"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_order_accuracy_metrics"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_order_accuracy_metrics"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_states"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_states"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_states"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb", "p_created_by_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb", "p_created_by_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_event"("p_organization_id" "uuid", "p_customer_id" "uuid", "p_customer_name" "text", "p_intake_event_id" "uuid", "p_order_data" "jsonb", "p_created_by_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_users"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_users"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_users"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_with_demo_fallback"("p_email" "text", "p_phone" "text", "p_log_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_with_demo_fallback"("p_email" "text", "p_phone" "text", "p_log_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_with_demo_fallback"("p_email" "text", "p_phone" "text", "p_log_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id_by_phone"("user_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id_by_phone"("user_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id_by_phone"("user_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_organization_admin"("check_user_id" "uuid", "check_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_organization_admin"("check_user_id" "uuid", "check_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_organization_admin"("check_user_id" "uuid", "check_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_predictions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_predictions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_predictions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_customers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_customers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_customers_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_email_orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_email_orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_email_orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_emails_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_emails_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_emails_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_gmail_watch_state_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_gmail_watch_state_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_gmail_watch_state_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_intake_files_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_intake_files_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_intake_files_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_item_variants_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_item_variants_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_item_variants_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_items_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_order_lines_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_order_lines_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_lines_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_organizations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_organizations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_organizations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_organizations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_organizations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_organizations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_waitlist_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_waitlist_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_waitlist_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_analysis_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_analysis_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_analysis_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_predictions" TO "anon";
GRANT ALL ON TABLE "public"."ai_predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_predictions" TO "service_role";



GRANT ALL ON TABLE "public"."auth_users" TO "anon";
GRANT ALL ON TABLE "public"."auth_users" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_users" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."demo_fallback_logs" TO "anon";
GRANT ALL ON TABLE "public"."demo_fallback_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_fallback_logs" TO "service_role";



GRANT ALL ON TABLE "public"."demo_leads" TO "anon";
GRANT ALL ON TABLE "public"."demo_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_leads" TO "service_role";



GRANT ALL ON TABLE "public"."gmail_watch_state" TO "anon";
GRANT ALL ON TABLE "public"."gmail_watch_state" TO "authenticated";
GRANT ALL ON TABLE "public"."gmail_watch_state" TO "service_role";



GRANT ALL ON TABLE "public"."intake_events" TO "anon";
GRANT ALL ON TABLE "public"."intake_events" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_events" TO "service_role";



GRANT ALL ON TABLE "public"."intake_files" TO "anon";
GRANT ALL ON TABLE "public"."intake_files" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_files" TO "service_role";



GRANT ALL ON TABLE "public"."item_variants" TO "anon";
GRANT ALL ON TABLE "public"."item_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."item_variants" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_states" TO "anon";
GRANT ALL ON TABLE "public"."oauth_states" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."order_change_proposal_lines" TO "anon";
GRANT ALL ON TABLE "public"."order_change_proposal_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."order_change_proposal_lines" TO "service_role";



GRANT ALL ON TABLE "public"."order_change_proposals" TO "anon";
GRANT ALL ON TABLE "public"."order_change_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."order_change_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."order_events" TO "anon";
GRANT ALL ON TABLE "public"."order_events" TO "authenticated";
GRANT ALL ON TABLE "public"."order_events" TO "service_role";



GRANT ALL ON TABLE "public"."order_lines" TO "anon";
GRANT ALL ON TABLE "public"."order_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."order_lines" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."user_organizations" TO "anon";
GRANT ALL ON TABLE "public"."user_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_organizations" TO "service_role";



GRANT ALL ON TABLE "public"."user_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tokens" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






