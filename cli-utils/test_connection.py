"""Quick smoke test: verify Supabase + Anthropic connectivity without writing any data."""

import os
import json
import anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

print("1. Checking env vars...")
for key in ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "ANTHROPIC_API_KEY", "ORGANIZATION_ID"]:
    val = os.environ.get(key, "")
    if not val:
        print(f"   ❌ {key} is missing")
    else:
        print(f"   ✅ {key} = {val[:20]}...")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
ORGANIZATION_ID = os.environ["ORGANIZATION_ID"]

print("\n2. Connecting to Supabase...")
sb = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

print("\n3. Loading customers...")
customers = sb.table("customers").select("id, name").eq("active", True).eq("organization_id", ORGANIZATION_ID).order("name").execute()
print(f"   ✅ {len(customers.data)} customers found")
for c in customers.data[:5]:
    print(f"      - {c['name']}")
if len(customers.data) > 5:
    print(f"      ... and {len(customers.data) - 5} more")

print("\n4. Loading items...")
items = sb.table("items").select("id, sku, name, item_variants(variant_code, variant_name)").eq("active", True).eq("organization_id", ORGANIZATION_ID).order("name").execute()
print(f"   ✅ {len(items.data)} items found")
for i in items.data[:5]:
    variants = [v["variant_code"] for v in i.get("item_variants", [])]
    print(f"      - {i['name']} [{i['sku']}] variants: {', '.join(variants)}")
if len(items.data) > 5:
    print(f"      ... and {len(items.data) - 5} more")

print("\n5. Checking orders table...")
orders = sb.table("orders").select("id, delivery_date, status").eq("organization_id", ORGANIZATION_ID).limit(3).execute()
print(f"   ✅ {len(orders.data)} orders returned (limit 3)")

print("\n6. Testing Anthropic API...")
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
resp = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=50,
    messages=[{"role": "user", "content": "Say 'hello' and nothing else."}],
)
text = resp.content[0].text
print(f"   ✅ Claude says: {text}")
print(f"   Model: {resp.model}")

print("\n" + "="*40)
print("All checks passed! Ready to run the agent.")
print("="*40)
