FROM python:3.11-slim

RUN pip install uv

COPY . /app
WORKDIR /app

# Remove local symlinks/dev files
RUN rm -f .env 2>/dev/null || true

RUN uv sync

EXPOSE 8001

CMD ["uv", "run", "chainlit", "run", "chainlit_app.py", "--host", "0.0.0.0", "--port", "8001"]
