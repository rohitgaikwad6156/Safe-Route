"""Research prototype context. All simulated inputs are explicitly identified."""
from datetime import datetime, timedelta, timezone

PUNE_TZ = timezone(timedelta(hours=5, minutes=30))


def pune_now():
    return datetime.now(PUNE_TZ)


def traffic_context(departure):
    """PDF p26: 1.7x morning, 1.8x evening, 1.0x overnight."""
    hour = departure.hour
    if hour == 8:
        return 20.0, 1.7
    if hour == 17:
        return 20.0, 1.8
    if 0 <= hour < 5:
        return 100.0, 1.0
    return 60.0, 1.0


def night_risk_multiplier(departure):
    return 1.2 if departure.hour >= 20 or departure.hour < 5 else 1.0
