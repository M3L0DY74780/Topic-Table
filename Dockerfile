FROM python:3.12-slim

WORKDIR /app

COPY . /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV STATE_FILE=/data/topic_table_state.json

RUN mkdir -p /data

EXPOSE 8000

CMD ["python", "app.py"]