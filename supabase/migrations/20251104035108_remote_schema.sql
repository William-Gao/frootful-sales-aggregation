alter table "public"."email_orders" drop constraint "email_orders_status_check";

alter table "public"."email_orders" add constraint "email_orders_status_check" CHECK ((status = ANY (ARRAY['received'::text, 'processing'::text, 'analyzed'::text, 'exported'::text, 'failed'::text, 'needs_review'::text]))) not valid;

alter table "public"."email_orders" validate constraint "email_orders_status_check";


