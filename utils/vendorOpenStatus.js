const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getZonedNow(timeZone = "Africa/Lagos", nowDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(nowDate).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const day = String(parts.weekday || "").toLowerCase();
  const dayIndex = DAYS.indexOf(day);

  return {
    day,
    dayIndex: dayIndex >= 0 ? dayIndex : nowDate.getDay(),
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

function formatIsoInTimeZone(isoValue, timeZone = "Africa/Lagos") {
  if (!isoValue) return null;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const isSameDay = dateFmt.format(date) === dateFmt.format(now);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  if (isSameDay) return timeLabel;

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);

  return `${dayLabel} at ${timeLabel}`;
}

function parseValidDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTimedRuleActive(rule, nowDate) {
  if (!rule || !rule.active) return false;
  if (!rule.until) return true;
  const untilDate = parseValidDate(rule.until);
  if (!untilDate) return true;
  return nowDate.getTime() < untilDate.getTime();
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizeAvailabilityConfig(raw = {}, existing = {}) {
  const base = existing && typeof existing === "object" ? existing : {};
  const input = raw && typeof raw === "object" ? raw : {};

  const normalizeTimedBlock = (blockInput, prevBlock = {}, extraFields = {}) => {
    const src = blockInput && typeof blockInput === "object" ? blockInput : prevBlock || {};
    const active = typeof src.active === "boolean" ? src.active : Boolean(prevBlock?.active);
    let until = null;
    if (active) {
      if (src.durationMinutes != null && Number(src.durationMinutes) > 0) {
        until = new Date(Date.now() + clampNumber(src.durationMinutes, 5, 10080, 30) * 60000).toISOString();
      } else if (src.until) {
        const parsed = parseValidDate(src.until);
        until = parsed ? parsed.toISOString() : null;
      }
    }
    return {
      active,
      until,
      reason: String(src.reason ?? prevBlock?.reason ?? "").trim().slice(0, 180),
      updatedAt: new Date().toISOString(),
      ...extraFields,
    };
  };

  const basePrepTimeMinutes = clampNumber(
    input.basePrepTimeMinutes ?? base.basePrepTimeMinutes,
    5,
    180,
    25
  );

  const busyInput = input.busyMode !== undefined ? input.busyMode : base.busyMode;
  const extraPrepMinutes = clampNumber(
    busyInput?.extraPrepMinutes ?? base.busyMode?.extraPrepMinutes,
    0,
    120,
    15
  );

  return {
    autoScheduleEnabled:
      typeof input.autoScheduleEnabled === "boolean"
        ? input.autoScheduleEnabled
        : base.autoScheduleEnabled !== false,
    basePrepTimeMinutes,
    busyMode: normalizeTimedBlock(busyInput, base.busyMode, { extraPrepMinutes }),
    orderPause: normalizeTimedBlock(
      input.orderPause !== undefined ? input.orderPause : base.orderPause,
      base.orderPause
    ),
    temporaryClosure: normalizeTimedBlock(
      input.temporaryClosure !== undefined ? input.temporaryClosure : base.temporaryClosure,
      base.temporaryClosure
    ),
  };
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
  const { timeZone = "Africa/Lagos", now: nowOverride } = options;
  const nowDate = nowOverride ? new Date(nowOverride) : new Date();

  const availability = openingHours?.availability && typeof openingHours.availability === "object"
    ? openingHours.availability
    : {};
  const autoScheduleEnabled = availability.autoScheduleEnabled !== false;
  const basePrepTimeMinutes = clampNumber(availability.basePrepTimeMinutes, 5, 180, 25);
  const busyActive = isTimedRuleActive(availability.busyMode, nowDate);
  const extraPrepMinutes = busyActive
    ? clampNumber(availability.busyMode?.extraPrepMinutes, 0, 120, 15)
    : 0;
  const estimatedPrepMinutes = basePrepTimeMinutes + extraPrepMinutes;

  const prepContext = {
    isBusy: busyActive,
    busyUntil: busyActive ? availability.busyMode?.until || null : null,
    busyReason: busyActive ? availability.busyMode?.reason || "" : "",
    basePrepTimeMinutes,
    extraPrepMinutes,
    estimatedPrepMinutes,
    autoScheduleEnabled,
  };

  // 1. Highest priority: Super-admin override
  const override = openingHours?.adminOverride;
  if (override?.status === "open") {
    return {
      isOpen: true,
      acceptingOrders: true,
      state: busyActive ? "busy" : "open",
      message: busyActive
        ? `Open now (Busy · ~${estimatedPrepMinutes} min prep) by administrator override.`
        : "Open now by administrator override.",
      reason: "admin_forced_open",
      override: true,
      ...prepContext,
    };
  }
  if (override?.status === "closed") {
    return {
      isOpen: false,
      acceptingOrders: false,
      state: "admin_closed",
      message: "Temporarily closed by administrator.",
      reason: "admin_forced_closed",
      override: true,
      ...prepContext,
    };
  }

  // 2. Temporary closure (auto-expires when `until` passes)
  if (isTimedRuleActive(availability.temporaryClosure, nowDate)) {
    const reopenLabel = formatIsoInTimeZone(availability.temporaryClosure?.until, timeZone);
    const closureReason = availability.temporaryClosure?.reason || "";
    return {
      isOpen: false,
      acceptingOrders: false,
      state: "temporarily_closed",
      reason: "temporarily_closed",
      reopenAt: availability.temporaryClosure?.until || null,
      closureReason,
      message: reopenLabel
        ? `Temporarily closed. Reopens ${reopenLabel}.${closureReason ? ` (${closureReason})` : ""}`
        : `Temporarily closed until further notice.${closureReason ? ` (${closureReason})` : ""}`,
      ...prepContext,
    };
  }

  // 3. Pause incoming orders (auto-resumes when `until` passes)
  if (isTimedRuleActive(availability.orderPause, nowDate)) {
    const resumeLabel = formatIsoInTimeZone(availability.orderPause?.until, timeZone);
    const pauseReason = availability.orderPause?.reason || "";
    return {
      isOpen: false,
      acceptingOrders: false,
      state: "orders_paused",
      reason: "orders_paused",
      resumeAt: availability.orderPause?.until || null,
      pauseReason,
      message: resumeLabel
        ? `Not accepting new orders right now. Resumes at ${resumeLabel}.`
        : "Temporarily paused incoming orders. Please check back shortly.",
      ...prepContext,
    };
  }

  // 4. Manual override of weekly schedule (when vendor disables automatic schedule closure)
  if (!autoScheduleEnabled) {
    return {
      isOpen: true,
      acceptingOrders: true,
      state: busyActive ? "busy" : "open",
      reason: busyActive ? "open_busy_manual" : "open_manual",
      message: busyActive
        ? `Open now · Busy (~${estimatedPrepMinutes} min prep)`
        : "Open now",
      ...prepContext,
    };
  }

  if (!openingHours) {
    return {
      isOpen: false,
      acceptingOrders: false,
      state: "closed",
      message: "Opening hours are not configured for this restaurant.",
      reason: "opening_hours_missing",
      ...prepContext,
    };
  }

  // 5. Automatic open/closed evaluation based on Africa/Lagos operating hours
  const now = getZonedNow(timeZone, nowDate);
  const currentDay = DAYS[now.dayIndex];
  const yesterdayDay = DAYS[(now.dayIndex + 6) % 7];

  const yesterday = getDayHours(openingHours, yesterdayDay);
  if (yesterday && !yesterday.closed) {
    const openMinutes = parseTime(yesterday.open, false);
    const closeMinutes = parseTime(yesterday.close, true);

    if (openMinutes != null && closeMinutes != null && closeMinutes < openMinutes && now.minutes < closeMinutes) {
      const closeLabel = formatDisplayTime(yesterday.close, true);
      return {
        isOpen: true,
        acceptingOrders: true,
        state: busyActive ? "busy" : "open",
        message: busyActive
          ? `Open now · Busy (~${estimatedPrepMinutes} min prep) until ${closeLabel}`
          : `Open now until ${closeLabel}`,
        reason: "open_overnight",
        ...prepContext,
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
          acceptingOrders: true,
          state: busyActive ? "busy" : "open",
          message: busyActive
            ? `Open 24 hours · Busy (~${estimatedPrepMinutes} min prep)`
            : "Open 24 hours today",
          reason: "open_24_hours",
          ...prepContext,
        };
      }

      const isOpenNow = closeMinutes > openMinutes
        ? now.minutes >= openMinutes && now.minutes < closeMinutes
        : now.minutes >= openMinutes;

      if (isOpenNow) {
        const closeLabel = formatDisplayTime(today.close, true);
        return {
          isOpen: true,
          acceptingOrders: true,
          state: busyActive ? "busy" : "open",
          message: busyActive
            ? `Open now · Busy (~${estimatedPrepMinutes} min prep) until ${closeLabel}`
            : `Open now until ${closeLabel}`,
          reason: "open_now",
          ...prepContext,
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
      acceptingOrders: false,
      state: "closed_schedule",
      message: `Closed now. Opens at ${formatDisplayTime(next.hours.open, false)} ${dayLabel}.`,
      reason: today?.closed ? "closed_today" : "closed_now",
      ...prepContext,
    };
  }

  return {
    isOpen: false,
    acceptingOrders: false,
    state: "closed_schedule",
    message: "Closed until further notice.",
    reason: "closed_until_further_notice",
    ...prepContext,
  };
}

export function assertVendorIsOpen(vendor, options = {}) {
  const status = getVendorOpenStatus(vendor?.openingHours, options);
  if (!status.isOpen) {
    const storeName = vendor?.storeName || "This restaurant";
    if (status.reason === "orders_paused") {
      throw new Error(`Order cannot be placed because ${storeName} has paused incoming orders. ${status.message}`);
    }
    if (status.reason === "temporarily_closed") {
      throw new Error(`Order cannot be placed because ${storeName} is temporarily closed. ${status.message}`);
    }
    throw new Error(`Order cannot be placed because ${storeName} is closed. ${status.message}`);
  }
  return status;
}
