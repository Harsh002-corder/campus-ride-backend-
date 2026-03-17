export const ROLES = {
  STUDENT: "student",
  DRIVER: "driver",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  SUB_ADMIN: "sub_admin",
};

export const ADMIN_DASHBOARD_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.SUB_ADMIN,
];

export const SUPER_ADMIN_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

export const RIDE_STATUS = {
  SCHEDULED: "scheduled",
  REQUESTED: "pending",
  ACCEPTED: "accepted",
  ONGOING: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const ALLOWED_ROLES = Object.values(ROLES);