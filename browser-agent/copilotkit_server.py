"""
Minimal CopilotKit remote endpoint server.
Run: cd browser-agent && uv run uvicorn copilotkit_server:app --port 8080 --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from copilotkit import CopilotKitRemoteEndpoint, Action
from copilotkit.integrations.fastapi import add_fastapi_endpoint

app = FastAPI(title="Frootful CopilotKit Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Define actions the copilot can call ---

async def greet(name: str = "World"):
    """A simple test action."""
    return f"Hello, {name}!"

sdk = CopilotKitRemoteEndpoint(
    actions=[
        Action(
            name="greet",
            description="Say hello to someone",
            handler=greet,
            parameters=[
                {
                    "name": "name",
                    "type": "string",
                    "description": "The name to greet",
                    "required": False,
                },
            ],
        ),
    ],
)

add_fastapi_endpoint(app, sdk, "/copilotkit")


@app.get("/health")
async def health():
    return {"status": "ok"}
