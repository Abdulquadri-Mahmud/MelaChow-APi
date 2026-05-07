const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getZonedNow(timeZone = "Africa/Lagos") {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const day = String(parts.weekday || "").toLowerCase();
  const dayIndex = DAYS.indexOf(day);

  return {
    day,
    dayIndex: dayIndex >= 0 ? dayIndex : new Date().getDay(),
    minutes: Number(parts.hour || 0) * 60 + Number(parts.minute || 0),
  };
}

function getDayHours(openingHours, dayName) {
  if (!openingHours) return null;
  const key = Object.keys(openingHours).find((item) => item.toLowerCase() === dayName.toLowerCase());
  return key ? openingHours[key] : null;
}

function parseTime(timeValue, isClosing = false) {
  if (!timeValue) return null;

  let value = String(timeValue).toLowerCase().trim();
  const isPM = value.includes("pm");
  const isAM = value.includes("am");

  value = value.replace(/[^0-9:]/g, "");
  if (!value) return null;
  if (!value.includes(":")) value += ":00";

  let [hours, minutes] = value.split(":").map((part) => Number.parseInt(part || "0", 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  if (isPM) {
    if (hours < 12) hours += 12;
  } else if (isAM) {
    if (hours === 12) hours = 0;
  } else if (isClosing && hours > 0 && hours < 12) {
    hours += 12;
  }

  return hours * 60 + minutes;
}

function formatDisplayTime(timeValue, isClosing = false) {
  const minutesValue = typeof timeValue === "string" ? parseTime(timeValue, isClosing) : timeValue;
  if (minutesValue == null) return "the scheduled time";

  let hours = Math.floor(minutesValue / 60) % 24;
  const minutes = minutesValue % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  hours %= 12;

  return `${hours || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getNextOpening(openingHours, currentDayIndex, currentMinutes) {
  for (let offset = 0; offset <= 6; offset += 1) {
    const nextDayIndex = (currentDayIndex + offset) % 7;
    const dayName = DAYS[nextDayIndex];
    const hours = getDayHours(openingHours, dayName);

    if (!hours || hours.closed) continue;

    const openMinutes = parseTime(hours.open, false);
    if (openMinutes == null) continue;
    if (offset === 0 && currentMinutes >= openMinutes) continue;

    return {
      dayName,
      hours,
      isToday: offset === 0,
      isTomorrow: offset === 1,
    };
  }

  return null;
}

export function getVendorOpenStatus(openingHours, options = {}) {
  if (!openingHours) {
    return {
      isOpen: false,
      message: "Opening hours are not configured for this restaurant.",
      reason: "opening_hours_missing",
    };
  }

  const { timeZone = "Africa/Lagos" } = options;
  const now = getZonedNow(timeZone);
  const currentDay = DAYS[now.dayIndex];
  const yesterdayDay = DAYS[(now.dayIndex + 6) % 7];

  const yesterday = getDayHours(openingHours, yesterdayDay);
  if (yesterday && !yesterday.closed) {
    const openMinutes = parseTime(yesterday.open, false);
    const closeMinutes = parseTime(yesterday.close, true);

    if (openMinutes != null && closeMinutes != null && closeMinutes < openMinutes && now.minutes < closeMinutes) {
      return {
        isOpen: true,
        message: `Open now until ${formatDisplayTime(yesterday.close, true)}`,
        reason: "open_overnight",
      };
    }
  }

  const today = getDayHours(openingHours, currentDay);
  if (today && !today.closed) {
    const openMinutes = parseTime(today.open, false);
    const closeMinutes = parseTime(today.close, true);

    if (openMinutes != null && closeMinutes != null) {
      if (openMinutes === closeMinutes) {
        return {
          isOpen: true,
          message: "Open 24 hours today",
          reason: "open_24_hours",
        };
      }

      const isOpenNow = closeMinutes > openMinutes
        ? now.minutes >= openMinutes && now.minutes < closeMinutes
        : now.minutes >= openMinutes;

      if (isOpenNow) {
        return {
          isOpen: true,
          message: `Open now until ${formatDisplayTime(today.close, true)}`,
          reason: "open_now",
        };
      }
    }
  }

  const next = getNextOpening(openingHours, now.dayIndex, now.minutes);
  if (next) {
    const dayLabel = next.isToday
      ? "today"
      : next.isTomorrow
        ? "tomorrow"
        : `on ${next.dayName.charAt(0).toUpperCase()}${next.dayName.slice(1)}`;

    return {
      isOpen: false,
      message: `Closed now. We will open at ${formatDisplayTime(next.hours.open, false)} ${dayLabel}.`,
      reason: today?.closed ? "closed_today" : "closed_now",
    };
  }

  return {
    isOpen: false,
    message: "Closed until further notice.",
    reason: "closed_until_further_notice",
  };
}

export function assertVendorIsOpen(vendor, options = {}) {
  const status = getVendorOpenStatus(vendor?.openingHours, options);
  if (!status.isOpen) {
    const storeName = vendor?.storeName || "This restaurant";
    throw new Error(`Order cannot be placed because ${storeName} is closed. ${status.message}`);
  }
  return status;
}
