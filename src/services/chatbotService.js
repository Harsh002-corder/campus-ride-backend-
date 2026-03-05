const FAQ_ANSWERS = [
  {
    keys: ["refund", "payment", "money"],
    answer: "Refunds are processed by support after ride cancellation review. Share ride ID for faster help.",
  },
  {
    keys: ["support", "help", "contact"],
    answer: "Support is available in-app from the Help section or via the support number in dashboard settings.",
  },
  {
    keys: ["driver", "late", "delay"],
    answer: "You can track your driver live in Ride Tracking and contact them via call/chat from your dashboard.",
  },
];

function toLowerText(value) {
  return String(value || "").toLowerCase().trim();
}

function includesAny(text, keys) {
  return keys.some((key) => text.includes(key));
}

export function detectJarviouIntent(message) {
  const text = toLowerText(message);

  if (!text) return { type: "unknown" };
  if (includesAny(text, ["book", "ride", "request ride"])) return { type: "book_ride" };
  if (includesAny(text, ["status", "where", "tracking", "track"])) return { type: "ride_status" };
  if (includesAny(text, ["cancel", "stop ride"])) return { type: "cancel_ride" };

  const faq = FAQ_ANSWERS.find((entry) => includesAny(text, entry.keys));
  if (faq) return { type: "faq", answer: faq.answer };

  return { type: "unknown" };
}

export function buildJarviouFallbackResponse(intent) {
  switch (intent.type) {
    case "book_ride":
      return "I can help book your ride. Please provide pickup, drop, and passenger count.";
    case "ride_status":
      return "I can check your ride status. Fetching your latest ride now.";
    case "cancel_ride":
      return "I can help cancel an active ride. Please confirm the ride ID if you have multiple rides.";
    case "faq":
      return intent.answer;
    default:
      return "I am Jarviou. You can ask me to book rides, check ride status, cancel rides, or answer transport FAQs.";
  }
}
