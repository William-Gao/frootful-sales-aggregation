"""
Auto-login to WebFlor and save session cookies.

Reads WEBFLOR_USER and WEBFLOR_PASS from .env, fills the login form via
Playwright, extracts cookies, and stores them in:
  1. Local .env file (WEBFLOR_COOKIES) for local dev
  2. Supabase user_tokens table (provider='webflor') for Cloud Run

Usage:
    cd browser-agent
    source .venv/bin/activate
    uv run login.py            # headless
    uv run login.py --visible  # watch the browser
    uv run login.py --debug    # dump login page HTML and exit
"""

import asyncio
import argparse
import os
import re
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

WEBFLOR_APP_URL = os.getenv("WEBFLOR_BASE_URL", "http://190.146.143.55:5522/WebflorExt")
WEBFLOR_USER = os.getenv("WEBFLOR_USER", "")
WEBFLOR_PASS = os.getenv("WEBFLOR_PASS", "")

# Use prod Supabase when APP_ENV=production (same logic as orchestrator)
_env = os.getenv("APP_ENV", "staging")
if _env == "production":
    SUPABASE_URL = "https://zkglvdfppodwlgzhfgqs.supabase.co"
    SUPABASE_SECRET_KEY = os.getenv("SUPABASE_PROD_SECRET_KEY", "")
else:
    SUPABASE_URL = "https://laxhubapvubwwoafrewk.supabase.co"
    SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
ORGANIZATION_ID = os.getenv("ORGANIZATION_ID", "81cf0716-45ee-4fe8-895f-d9af962f5fab")


def update_env_file(cookie_str: str):
    """Write WEBFLOR_COOKIES into the .env file."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            content = f.read()

        if re.search(r"^WEBFLOR_COOKIES=.*$", content, re.MULTILINE):
            content = re.sub(
                r"^WEBFLOR_COOKIES=.*$",
                f"WEBFLOR_COOKIES={cookie_str}",
                content,
                flags=re.MULTILINE,
            )
        else:
            content = content.rstrip() + f"\nWEBFLOR_COOKIES={cookie_str}\n"
    else:
        content = f"WEBFLOR_COOKIES={cookie_str}\n"

    with open(env_path, "w") as f:
        f.write(content)

    print(f"Saved cookies to {env_path}")


def save_cookies_to_supabase(cookie_str: str, cookies: list[dict]):
    """Upsert WebFlor cookies into user_tokens table.

    Uses the actual cookie expiry from the browser session (Playwright's `expires`
    field is a Unix timestamp, -1 means session cookie with no explicit expiry).
    """
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        print("WARNING: SUPABASE_URL/SUPABASE_SECRET_KEY not set, skipping Supabase save")
        return

    from supabase import create_client

    # Find the latest real expiry from the cookies (skip session cookies with expires=-1)
    max_expires = max(
        (c.get("expires", -1) for c in cookies if c.get("expires", -1) > 0),
        default=-1,
    )
    expires_at = None
    if max_expires > 0:
        expires_at = datetime.fromtimestamp(max_expires, tz=timezone.utc).isoformat()
        print(f"Cookie expiry from session: {expires_at}")
    else:
        print("Session cookies (no explicit expiry)")

    sb = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

    row = {
        "provider": "webflor",
        "encrypted_access_token": cookie_str,
        "organization_id": ORGANIZATION_ID,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if expires_at:
        row["token_expires_at"] = expires_at

    sb.table("user_tokens").upsert(row, on_conflict="provider,organization_id").execute()

    print(f"Saved cookies to Supabase (user_tokens, provider=webflor)")


async def login(headless: bool = True, debug: bool = False):
    if not WEBFLOR_USER or not WEBFLOR_PASS:
        print("ERROR: Set WEBFLOR_USER and WEBFLOR_PASS in .env")
        sys.exit(1)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context()
        page = await context.new_page()

        print(f"Navigating to {WEBFLOR_APP_URL} ...")
        await page.goto(WEBFLOR_APP_URL, wait_until="networkidle", timeout=60000)

        if debug:
            html = await page.content()
            debug_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "login_page.html")
            with open(debug_path, "w") as f:
                f.write(html)
            print(f"Login page HTML saved to {debug_path}")
            print(f"Current URL: {page.url}")
            await browser.close()
            return

        # Wait for the login form to be visible (page uses a loading spinner)
        await page.wait_for_selector("#myDiv", state="visible", timeout=15000)
        await page.wait_for_selector("#txtusername", state="visible", timeout=10000)

        print("Filling credentials ...")

        # Fill username — use click + type to trigger Kendo validation events
        await page.click("#txtusername")
        await page.fill("#txtusername", WEBFLOR_USER)
        # Tab out of username to trigger the Kendo validator (customRule1 calls
        # ValidarUsuario via AJAX which populates hidden fields + shows company/farm)
        await page.press("#txtusername", "Tab")

        # Wait for the AJAX ValidarUsuario call to complete
        # It sets hidden fields and may show the company/farm dropdowns
        await asyncio.sleep(3)

        # Fill password
        await page.click("#txtpassword")
        await page.fill("#txtpassword", WEBFLOR_PASS)

        # Click the login button (calls IniciarSesion which does AJAX validation
        # then submits the form via $(control).closest('form').submit())
        print("Clicking login ...")
        await page.click("#btnLogin")

        # Wait for navigation away from login — the form POSTs to /WebflorExt/
        # and should redirect to the main app page
        try:
            await page.wait_for_url(
                lambda url: "/Index/Index" not in url and "login" not in url.lower(),
                timeout=30000,
            )
            print(f"Redirected to: {page.url}")
        except Exception:
            # Sometimes the URL stays the same but the page content changes
            # Check if we're past the login form
            login_visible = await page.is_visible("#dvloginbox")
            if login_visible:
                # Check for error messages
                error_el = await page.query_selector("#dvlogin-alert")
                if error_el:
                    error_text = await error_el.inner_text()
                    if error_text.strip():
                        print(f"LOGIN ERROR: {error_text}")
                        await browser.close()
                        sys.exit(1)

                print(f"WARNING: May still be on login page. URL: {page.url}")
                print("Check credentials or run with --visible to watch.")
                await browser.close()
                sys.exit(1)

        await asyncio.sleep(2)  # let cookies settle

        # Extract cookies (including HttpOnly ones)
        cookies = await context.cookies()
        await browser.close()

    if not cookies:
        print("ERROR: No cookies captured.")
        sys.exit(1)

    cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
    print(f"Got {len(cookies)} cookies")

    # Save to .env (local dev)
    update_env_file(cookie_str)

    # Save to Supabase (Cloud Run / shared state)
    save_cookies_to_supabase(cookie_str, cookies)

    # Also print so it can be piped/copied
    print(f"\nCookies:\n{cookie_str}")


def main():
    parser = argparse.ArgumentParser(description="Auto-login to WebFlor and save cookies")
    parser.add_argument("--visible", action="store_true", help="Show the browser window")
    parser.add_argument("--debug", action="store_true", help="Dump login page HTML and exit")
    args = parser.parse_args()

    asyncio.run(login(headless=not args.visible, debug=args.debug))


if __name__ == "__main__":
    main()
