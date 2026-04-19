import csv
import os
import time
import requests

CSV_FILE = os.getenv("CSV_FILE", "sender/ip_addresses.csv")
SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:5000/receive")
TIME_SCALE = max(float(os.getenv("TIME_SCALE", "1.0")), 0.001)  # 1.0 = real time, 60.0 = 60 times faster
STARTUP_RETRIES = int(os.getenv("STARTUP_RETRIES", "30"))
STARTUP_DELAY_SECONDS = float(os.getenv("STARTUP_DELAY_SECONDS", "1.0"))
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "5.0"))


def load_packets(csv_file):
    packets = []

    with open(csv_file, "r", encoding="utf-8") as file:
        reader = csv.DictReader(file)

        for row in reader:
            packet = {
                "ip_address": row["ip address"].strip(),
                "latitude": float(row["Latitude"]),
                "longitude": float(row["Longitude"]),
                "timestamp": int(float(row["Timestamp"])),
                "suspicious": int(float(row["suspicious"])),
            }
            packets.append(packet)

    packets.sort(key=lambda packet: packet["timestamp"])
    return packets


def get_health_url(receive_url):
    return receive_url.rsplit("/receive", 1)[0] + "/health" if receive_url.endswith("/receive") else receive_url


def wait_for_server():
    health_url = get_health_url(SERVER_URL)

    for attempt in range(1, STARTUP_RETRIES + 1):
        try:
            response = requests.get(health_url, timeout=REQUEST_TIMEOUT)
            if response.ok:
                print(f"Backend is ready: {health_url}")
                return
        except requests.RequestException:
            pass

        print(f"Waiting for backend ({attempt}/{STARTUP_RETRIES})...")
        time.sleep(STARTUP_DELAY_SECONDS)

    raise RuntimeError(f"Backend is not ready after {STARTUP_RETRIES} attempts: {health_url}")


def send_packets(packets):
    previous_timestamp = None

    for index, packet in enumerate(packets, start=1):
        if previous_timestamp is not None:
            delay = packet["timestamp"] - previous_timestamp
            if delay > 0:
                time.sleep(delay / TIME_SCALE)

        response = requests.get(SERVER_URL, params=packet, timeout=REQUEST_TIMEOUT)

        print(
            f"[{index}/{len(packets)}] sent {packet['ip_address']} "
            f"timestamp={packet['timestamp']} status={response.status_code}"
        )

        previous_timestamp = packet["timestamp"]


if __name__ == "__main__":
    wait_for_server()
    packets = load_packets(CSV_FILE)
    send_packets(packets)
