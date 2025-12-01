create extension if not exists "pgjwt" with schema "extensions";


drop trigger if exists "update_orders_updated_at" on "public"."orders";

drop policy "Users can delete own orders" on "public"."orders";

drop policy "Users can insert own orders" on "public"."orders";

drop policy "Users can read own orders" on "public"."orders";

drop policy "Users can update own orders" on "public"."orders";

revoke delete on table "public"."orders" from "anon";

revoke insert on table "public"."orders" from "anon";

revoke references on table "public"."orders" from "anon";

revoke select on table "public"."orders" from "anon";

revoke trigger on table "public"."orders" from "anon";

revoke truncate on table "public"."orders" from "anon";

revoke update on table "public"."orders" from "anon";

revoke delete on table "public"."orders" from "authenticated";

revoke insert on table "public"."orders" from "authenticated";

revoke references on table "public"."orders" from "authenticated";

revoke select on table "public"."orders" from "authenticated";

revoke trigger on table "public"."orders" from "authenticated";

revoke truncate on table "public"."orders" from "authenticated";

revoke update on table "public"."orders" from "authenticated";

revoke delete on table "public"."orders" from "service_role";

revoke insert on table "public"."orders" from "service_role";

revoke references on table "public"."orders" from "service_role";

revoke select on table "public"."orders" from "service_role";

revoke trigger on table "public"."orders" from "service_role";

revoke truncate on table "public"."orders" from "service_role";

revoke update on table "public"."orders" from "service_role";

alter table "public"."orders" drop constraint "orders_order_number_key";

alter table "public"."orders" drop constraint "orders_source_check";

alter table "public"."orders" drop constraint "orders_status_check";

alter table "public"."orders" drop constraint "orders_user_id_fkey";

drop function if exists "public"."update_orders_updated_at"();

alter table "public"."orders" drop constraint "orders_pkey";

drop index if exists "public"."idx_orders_created_at";

drop index if exists "public"."idx_orders_customer_email";

drop index if exists "public"."idx_orders_order_number";

drop index if exists "public"."idx_orders_source";

drop index if exists "public"."idx_orders_status";

drop index if exists "public"."idx_orders_user_id";

drop index if exists "public"."orders_order_number_key";

drop index if exists "public"."orders_pkey";

drop table "public"."orders";

create table "public"."demo_leads" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."demo_leads" enable row level security;

create table "public"."waitlist" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "name" text,
    "company" text,
    "message" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."waitlist" enable row level security;

alter table "public"."text_orders" drop column "processed_at";

alter table "public"."text_orders" add column "updated_at" timestamp with time zone;

alter table "public"."user_tokens" add column "customer_pricing_group" text;

CREATE UNIQUE INDEX demo_leads_pkey ON public.demo_leads USING btree (id);

CREATE INDEX idx_demo_leads_created_at ON public.demo_leads USING btree (created_at);

CREATE INDEX idx_demo_leads_email ON public.demo_leads USING btree (email);

CREATE INDEX idx_waitlist_created_at ON public.waitlist USING btree (created_at);

CREATE INDEX idx_waitlist_email ON public.waitlist USING btree (email);

CREATE UNIQUE INDEX waitlist_email_key ON public.waitlist USING btree (email);

CREATE UNIQUE INDEX waitlist_pkey ON public.waitlist USING btree (id);

alter table "public"."demo_leads" add constraint "demo_leads_pkey" PRIMARY KEY using index "demo_leads_pkey";

alter table "public"."waitlist" add constraint "waitlist_pkey" PRIMARY KEY using index "waitlist_pkey";

alter table "public"."waitlist" add constraint "waitlist_email_key" UNIQUE using index "waitlist_email_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_waitlist_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_email_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$function$
;

grant delete on table "public"."demo_leads" to "anon";

grant insert on table "public"."demo_leads" to "anon";

grant references on table "public"."demo_leads" to "anon";

grant select on table "public"."demo_leads" to "anon";

grant trigger on table "public"."demo_leads" to "anon";

grant truncate on table "public"."demo_leads" to "anon";

grant update on table "public"."demo_leads" to "anon";

grant delete on table "public"."demo_leads" to "authenticated";

grant insert on table "public"."demo_leads" to "authenticated";

grant references on table "public"."demo_leads" to "authenticated";

grant select on table "public"."demo_leads" to "authenticated";

grant trigger on table "public"."demo_leads" to "authenticated";

grant truncate on table "public"."demo_leads" to "authenticated";

grant update on table "public"."demo_leads" to "authenticated";

grant delete on table "public"."demo_leads" to "service_role";

grant insert on table "public"."demo_leads" to "service_role";

grant references on table "public"."demo_leads" to "service_role";

grant select on table "public"."demo_leads" to "service_role";

grant trigger on table "public"."demo_leads" to "service_role";

grant truncate on table "public"."demo_leads" to "service_role";

grant update on table "public"."demo_leads" to "service_role";

grant delete on table "public"."waitlist" to "anon";

grant insert on table "public"."waitlist" to "anon";

grant references on table "public"."waitlist" to "anon";

grant select on table "public"."waitlist" to "anon";

grant trigger on table "public"."waitlist" to "anon";

grant truncate on table "public"."waitlist" to "anon";

grant update on table "public"."waitlist" to "anon";

grant delete on table "public"."waitlist" to "authenticated";

grant insert on table "public"."waitlist" to "authenticated";

grant references on table "public"."waitlist" to "authenticated";

grant select on table "public"."waitlist" to "authenticated";

grant trigger on table "public"."waitlist" to "authenticated";

grant truncate on table "public"."waitlist" to "authenticated";

grant update on table "public"."waitlist" to "authenticated";

grant delete on table "public"."waitlist" to "service_role";

grant insert on table "public"."waitlist" to "service_role";

grant references on table "public"."waitlist" to "service_role";

grant select on table "public"."waitlist" to "service_role";

grant trigger on table "public"."waitlist" to "service_role";

grant truncate on table "public"."waitlist" to "service_role";

grant update on table "public"."waitlist" to "service_role";

create policy "Anyone can insert demo leads"
on "public"."demo_leads"
as permissive
for insert
to authenticated, anon
with check (true);


create policy "Authenticated users can read all demo leads"
on "public"."demo_leads"
as permissive
for select
to authenticated
using (true);


create policy "Anyone can join waitlist"
on "public"."waitlist"
as permissive
for insert
to authenticated, anon
with check (true);


create policy "Authenticated users can read waitlist"
on "public"."waitlist"
as permissive
for select
to authenticated
using (true);


CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON public.waitlist FOR EACH ROW EXECUTE FUNCTION update_waitlist_updated_at();


