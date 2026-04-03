export const resortRules = [
  {
    title: "Observe check-in schedule",
    description: "Guests must arrive within their reserved tour time and present a valid booking reference at entry.",
  },
  {
    title: "Respect guest capacity",
    description: "Only the confirmed number of guests included in the reservation may enter unless approved by resort staff.",
  },
  {
    title: "Keep the resort clean",
    description: "Dispose of trash properly and help maintain cottages, pools, and shared areas in good condition.",
  },
  {
    title: "Handle resort property carefully",
    description: "Damaged or missing resort items may be charged to the guest responsible for the reservation.",
  },
  {
    title: "Follow safety instructions",
    description: "Pool, event, and activity areas must be used according to posted guidelines and staff instructions.",
  },
  {
    title: "Payments are subject to verification",
    description: "Reservation fees and uploaded payment proofs are reviewed by admin before final booking confirmation.",
  },
];

export const normalizeResortRules = (rules) => {
  if (!Array.isArray(rules) || rules.length === 0) {
    return resortRules;
  }

  return [...rules]
    .filter((rule) => rule && rule.title && rule.description && rule.is_active !== false)
    .sort((left, right) => (left.sort_order ?? 999) - (right.sort_order ?? 999));
};