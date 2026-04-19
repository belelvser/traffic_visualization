import os
from pathlib import Path
from flask import Flask, jsonify, request, render_template

BASE_DIR = Path(__file__).resolve().parent.parent

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "frontend"),
    static_folder=str(BASE_DIR / "frontend" / "static"),
    static_url_path="/static"
)

packets = []


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/receive", methods=["GET"])
def receive_packet():
    packet = {
        "ip_address": request.args.get("ip_address"),
        "latitude": float(request.args.get("latitude")),
        "longitude": float(request.args.get("longitude")),
        "timestamp": int(float(request.args.get("timestamp"))),
        "suspicious": int(float(request.args.get("suspicious"))),
    }

    packets.append(packet)

    return jsonify({
        "status": "ok",
        "message": "Packet received",
        "packet": packet,
        "total_packets": len(packets)
    })


@app.route("/packets", methods=["GET"])
def get_packets():
    after = request.args.get("after", default=0, type=int)

    return jsonify({
        "packets": packets[after:],
        "total_packets": len(packets)
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "running"})


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug)
