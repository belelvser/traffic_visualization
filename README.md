# Traffic Visualization (Docker Compose)

This project visualizes incoming traffic packets on an interactive 3D globe.

Traffic data is read from a CSV file, replayed in timestamp order, sent to a Flask backend, and displayed in real time on the frontend. The visual style is intentionally minimal: black background, dark globe, and acid-green packet markers that slowly fade out to avoid visual overload.

This project runs in Docker Compose with two containers: `backend` (Flask serves both UI and API) and `sender`.

## Tech Stack

- Python
- Flask
- Requests
- HTML / CSS / JavaScript
- Three.js
- Docker Compose

## Quick start

```bash
docker compose up --build
```

After startup:
`http://localhost:5000`

## Services

- `backend` (Flask):
  - serves `frontend/index.html` and `frontend/static/*`
  - `GET /receive` - ingest packet
  - `GET /packets` - list packets
  - `GET /health` - healthcheck
- `sender` (Python):
  - waits until `backend` is healthy
  - sends packets from `sender/ip_addresses.csv`

## Project structure

```text
traffic_visualization/
|-- backend/
|   |-- flask_server_visual.py
|   `-- Dockerfile
|-- frontend/
|   |-- index.html
|   `-- static/
|       |-- app.js
|       `-- style.css
|-- sender/
|   |-- senders.py
|   |-- ip_addresses.csv
|   `-- Dockerfile
|-- docker-compose.yml
|-- requirements.txt
`-- README.md
```

## cURL examples

Check health:

```bash
curl http://localhost:5000/health
```

Get all packets:

```bash
curl http://localhost:5000/packets
```

Get packets after index `N`:

```bash
curl "http://localhost:5000/packets?after=10"
```

Send one packet to backend:

```bash
curl "http://localhost:5000/receive?ip_address=8.8.8.8&latitude=37.3860&longitude=-122.0838&timestamp=1710000000&suspicious=1"
```

Fetch frontend HTML:

```bash
curl http://localhost:5000/
```

## Useful commands

Stop all services:

```bash
docker compose down
```

Stop and remove local images:

```bash
docker compose down --rmi local
```
