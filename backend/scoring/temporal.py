"""
Temporal and Calendar Modifiers Module.
Adjusts route safety scores dynamically based on trip departure time and day of week.
Rules:
- 07:00 - 11:59 (Morning Peak): +8.0
- 12:00 - 16:59 (Daytime Peak): +5.0
- 17:00 - 19:59 (Evening Transition): 0.0
- 20:00 - 22:59 (Late Evening): -10.0
- 23:00 - 04:59 (Dead of Night): -20.0
- 05:00 - 06:59 (Early Morning Transition): 0.0
- Weekend Penalty (Friday 20:00 to Sunday 23:59): -3.0
"""
from datetime import datetime, time
from typing import Union


def get_time_modifier(departure_time: Union[time, datetime]) -> float:
    """
    Returns the time-of-day score adjustment based on departure hour.
    """
    if isinstance(departure_time, datetime):
        t = departure_time.time()
    else:
        t = departure_time

    h = t.hour
    m = t.minute
    total_minutes = h * 60 + m

    # 07:00 to 11:59 -> 420 to 719 mins
    if 420 <= total_minutes <= 719:
        return 8.0

    # 12:00 to 16:59 -> 720 to 1019 mins
    if 720 <= total_minutes <= 1019:
        return 5.0

    # 17:00 to 19:59 -> 1020 to 1199 mins
    if 1020 <= total_minutes <= 1199:
        return 0.0

    # 20:00 to 22:59 -> 1200 to 1379 mins
    if 1200 <= total_minutes <= 1379:
        return -10.0

    # 23:00 to 04:59 -> >= 1380 or < 300 mins
    if total_minutes >= 1380 or total_minutes < 300:
        return -20.0

    # 05:00 to 06:59 -> 300 to 419 mins
    return 0.0


def get_weekend_modifier(departure_datetime: datetime) -> float:
    """
    Returns the weekend modifier: -3.0 from Friday night (20:00) through Sunday 23:59.
    Python weekday: Monday=0, Tuesday=1, ..., Friday=4, Saturday=5, Sunday=6.
    """
    weekday = departure_datetime.weekday()
    hour = departure_datetime.hour

    # Friday after 20:00
    if weekday == 4 and hour >= 20:
        return -3.0

    # All of Saturday and Sunday
    if weekday in (5, 6):
        return -3.0

    return 0.0


def calculate_temporal_adjustment(departure: datetime) -> float:
    """
    Calculates combined temporal + calendar modifier for departure datetime.
    """
    t_mod = get_time_modifier(departure)
    w_mod = get_weekend_modifier(departure)
    return t_mod + w_mod
