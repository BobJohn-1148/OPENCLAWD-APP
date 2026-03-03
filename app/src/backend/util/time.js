function nowChicago() {
  // Returns a Date representing "now"; formatting will use Intl tz.
  return new Date();
}

function nowTs() {
  return Date.now();
}

function getTzParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function shouldTriggerDaily({ now = new Date(), timeZone, hour, minute, lastSentAtMs }) {
  const p = getTzParts(now, timeZone);
  const isTargetMinute = p.hour === hour && p.minute === minute;
  if (!isTargetMinute) return false;

  // Only once per local day
  if (!lastSentAtMs) return true;
  const lastP = getTzParts(new Date(lastSentAtMs), timeZone);
  const sameDay = lastP.year === p.year && lastP.month === p.month && lastP.day === p.day;
  return !sameDay;
}

module.exports = { getTzParts, shouldTriggerDaily, nowChicago, nowTs };
