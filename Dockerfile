FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TAX_HOST=0.0.0.0 \
    TAX_PORT=8765 \
    TZ=Asia/Dhaka

# tzdata so save times and backup names use local time
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py pdftext.py ./
COPY static ./static

# Data lives on a bind mount (see docker-compose.yml) so it survives rebuilds
VOLUME ["/app/data"]
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/people', timeout=2)"

CMD ["python", "server.py", "--no-browser"]
