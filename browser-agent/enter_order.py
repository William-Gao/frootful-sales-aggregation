"""
Frootful Browser Agent — Hello World.

Usage:
    cd browser-agent
    source .venv/bin/activate
    uv run enter_order.py
"""

import asyncio
import logging

from browser_use import Agent, ChatAnthropic
from dotenv import load_dotenv

load_dotenv()

# Show detailed logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    logger.info("Initializing LLM...")
    llm = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0.0)

    logger.info("Creating agent...")
    agent = Agent(
        task="Navigate to https://frootful.ai and tell me what the site is about",
        llm=llm,
    )

    logger.info("Running agent...")
    history = await agent.run()

    print("\n--- Agent finished ---")
    print(f"Done: {history.is_done()}")
    print(f"Success: {history.is_successful()}")
    print(f"Steps: {history.number_of_steps()}")
    print(f"URLs visited: {history.urls()}")
    print(f"Actions: {history.action_names()}")
    if history.errors():
        print(f"Errors: {history.errors()}")
    print(f"\nResult:\n{history.final_result()}")


if __name__ == "__main__":
    asyncio.run(main())
